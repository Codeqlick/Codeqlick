import { resolve4 } from 'node:dns/promises';
import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { siteLiveEmail } from '../domains/domain-emails.js';
import { DomainsService } from '../domains/domains.service.js';
import { MailService } from '../mail/mail.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { ManagedSitesRepository, type SiteRow } from './managed-sites.repository.js';
import { ManagedSitesService, type SiteView } from './managed-sites.service.js';

type DomainState = 'UNREGISTERED' | 'ELSEWHERE' | 'LIVE';

const MINUTE_MS = 60_000;
const RUN_EVERY_MS = 10 * MINUTE_MS;
const LIVE_RECHECK_MS = 6 * 60 * MINUTE_MS;

/** The state from what was found: registered at all, resolving here, answering over HTTPS. */
export function domainStateOf(found: {
  registered: boolean | null;
  addresses: string[];
  serverIp: string | undefined;
  https: boolean;
}): DomainState {
  if (found.registered === false) return 'UNREGISTERED';
  if (found.addresses.length === 0 && found.registered === null) return 'UNREGISTERED';
  const here = found.serverIp
    ? found.addresses.includes(found.serverIp)
    : found.addresses.length > 0;
  return here && found.https ? 'LIVE' : 'ELSEWHERE';
}

/**
 * Where each managed site's own domain stands (architecture 8.2): checked every 10 minutes until
 * it serves the site, every 6 hours after. On the way it is connected through OVH when the team
 * manages it (11.4). Turning LIVE rebuilds the site with the domain and tells the client.
 */
@Injectable()
export class SiteDomainsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SiteDomainsService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repository: ManagedSitesRepository,
    private readonly sites: ManagedSitesService,
    private readonly domains: DomainsService,
    private readonly accounts: AccountsService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly config: AppConfigService,
    private readonly monitoring: MonitoringService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runDue(), RUN_EVERY_MS);
    this.timer.unref();
    setTimeout(() => void this.runDue(), 3 * MINUTE_MS).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Checks the project's site domain now (admin "Comprobar", or right after it changes). */
  async check(projectId: string): Promise<SiteView> {
    const site = await this.repository.findByProject(projectId);
    if (!site) throw new NotFoundException('The project has no managed site');
    if (site.domain) await this.checkSite(site);
    return (await this.sites.get(projectId))!;
  }

  /** `check` without waiting or failing: for after a domain is set (off in tests, as the timer). */
  checkSoon(projectId: string): void {
    if (this.config.nodeEnv === 'test') return;
    void this.check(projectId).catch((error: unknown) =>
      this.logger.warn(`Domain check of project ${projectId} failed: ${String(error)}`),
    );
  }

  /** Every site whose domain is due. Never throws. */
  async runDue(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const site of await this.repository.withDomain()) {
        const due =
          site.domainState !== 'LIVE' ||
          !site.domainCheckedAt ||
          now.getTime() - site.domainCheckedAt.getTime() > LIVE_RECHECK_MS;
        if (!due) continue;
        await this.checkSite(site, now).catch((error: unknown) =>
          this.logger.error(`Domain check of ${site.domain} failed: ${String(error)}`),
        );
      }
    } catch (error) {
      this.logger.error(`Site domain run failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** Where the domain resolves (IPv4) and whether it answers over HTTPS. */
  async probe(domain: string): Promise<{ addresses: string[]; https: boolean }> {
    const addresses = await resolve4(domain).catch(() => [] as string[]);
    const https =
      addresses.length > 0 &&
      (await fetch(`https://${domain}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
        .then((response) => response.status === 200)
        .catch(() => false));
    return { addresses, https };
  }

  private async checkSite(site: SiteRow, now = new Date()): Promise<void> {
    const domain = site.domain!;
    const connection = await this.domains.connect(site.projectId, domain);
    const { addresses, https } = await this.probe(domain);
    let state = domainStateOf({
      registered: connection.registered,
      addresses,
      serverIp: this.config.sitesServerIp,
      https,
    });
    // HTTPS can fail for a moment: a LIVE domain that still resolves here stays LIVE.
    const serverIp = this.config.sitesServerIp;
    if (
      site.domainState === 'LIVE' &&
      state === 'ELSEWHERE' &&
      serverIp &&
      addresses.includes(serverIp)
    ) {
      state = 'LIVE';
    }

    await this.repository.update(site.id, { domainState: state, domainCheckedAt: now });
    if (state === site.domainState) return;
    if (state === 'LIVE' || site.domainState === 'LIVE') {
      await this.sites.addressChanged(site.projectId);
    }
    if (state === 'LIVE') {
      const actor = { id: null, name: 'Codeqlick' };
      // Onboarding leaves a client domain unmonitored until it answers.
      await this.monitoring
        .setEnabled(actor, site.projectId, true)
        .catch((error: unknown) =>
          this.logger.warn(`Monitor of ${domain} not enabled: ${String(error)}`),
        );
      await this.activity.record(actor, {
        action: 'project.site_domain_live',
        targetId: site.projectId,
        targetLabel: site.project.name,
        details: { domain },
      });
      for (const person of await this.accounts.people(site.project.client.id)) {
        await this.mail
          .send(siteLiveEmail(person, domain, this.config.siteUrl))
          .catch((error: unknown) =>
            this.logger.error(`Site live email to ${person.email} failed`, error),
          );
      }
    }
  }
}
