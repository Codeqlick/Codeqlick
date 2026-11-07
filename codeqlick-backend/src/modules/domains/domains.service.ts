import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { availableFromRdap, candidatesOf } from './availability.js';
import { MailService } from '../mail/mail.service.js';
import { domainClientEmail, domainTeamEmail } from './domain-emails.js';
import { DomainsRepository, type DomainRow } from './domains.repository.js';
import type { DomainSettingsInput } from './domains.schemas.js';
import { OvhClient } from './ovh.client.js';
import { daysUntil, expiryFromRdap, rdapUrl, reminderDue, type RdapBootstrap } from './rdap.js';

export interface DomainView {
  name: string | null;
  source: 'RDAP' | 'MANUAL' | 'OVH';
  /** `yyyy-mm-dd`, or null while unknown. */
  expiresAt: string | null;
  daysLeft: number | null;
  checkedAt: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const CHECK_EVERY_MS = 6 * HOUR_MS;
const RECHECK_AFTER_MS = 24 * HOUR_MS;
const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const USER_AGENT = 'codeqlick-platform/1.0 (+https://codeqlick.com)';
const AVAILABILITY_TTL_MS = 10 * 60_000;

export interface AvailabilityResult {
  domain: string;
  /** Null when neither OVH nor the registry says. */
  available: boolean | null;
}

/** A managed site's domain after a connection attempt (architecture 8.2). */
export interface DomainConnection {
  /** The team's OVH account manages it (it is the technical contact). */
  managed: boolean;
  /** False when nobody has it yet; null when unknown. */
  registered: boolean | null;
}

/**
 * Domain renewal reminders (architecture 8.2): the expiry comes from RDAP when the registry
 * publishes it, or is typed by the team; 30 and 7 days before it, the team and the client are
 * emailed once each. Runs in the API process every 6 hours (off in tests).
 */
@Injectable()
export class DomainsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DomainsService.name);
  private timer: NodeJS.Timeout | undefined;
  private bootstrap: { data: RdapBootstrap; at: number } | undefined;
  private readonly availabilityCache = new Map<string, { available: boolean | null; at: number }>();

  constructor(
    private readonly repository: DomainsRepository,
    private readonly accounts: AccountsService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly config: AppConfigService,
    private readonly ovh: OvhClient,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runDue(), CHECK_EVERY_MS);
    this.timer.unref();
    setTimeout(() => void this.runDue(), 2 * 60_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async get(projectId: string, now = new Date()): Promise<DomainView> {
    return this.view(await this.find(projectId), now);
  }

  async save(actor: AuthUser, projectId: string, input: DomainSettingsInput): Promise<DomainView> {
    const project = await this.find(projectId);
    const changed = input.name !== project.domainName || input.source !== project.domainSource;
    let row = await this.repository.update(projectId, {
      domainName: input.name,
      domainSource: input.source,
      ...(input.source === 'MANUAL'
        ? { domainExpiresAt: input.expiresAt ? new Date(`${input.expiresAt}T00:00:00Z`) : null }
        : changed
          ? { domainExpiresAt: null }
          : {}),
      ...(changed ? { domainCheckedAt: null, domainWarnedFor: null } : {}),
    });
    await this.activity.record(actor, {
      action: 'project.domain_updated',
      targetId: projectId,
      targetLabel: project.name,
      details: { domain: input.name, source: input.source },
    });
    if (row.domainName && row.domainSource !== 'MANUAL') row = await this.refresh(row);
    return this.view(row);
  }

  /** A managed site got its own domain: watch it, unless the project already watches one. */
  async adopt(projectId: string, domainName: string): Promise<void> {
    await this.repository.adoptDomain(projectId, domainName);
  }

  async check(projectId: string): Promise<DomainView> {
    const row = await this.find(projectId);
    return this.view(
      row.domainName && row.domainSource !== 'MANUAL' ? await this.refresh(row) : row,
    );
  }

  /**
   * Whether the domains for what a person typed are free (architecture 8.2): OVH's answer when
   * its keys are set, the registry's RDAP otherwise. Cached for 10 minutes.
   */
  async availability(input: string): Promise<AvailabilityResult[] | null> {
    const candidates = candidatesOf(input);
    if (!candidates) return null;
    return Promise.all(
      candidates.map(async (domain) => ({ domain, available: await this.isAvailable(domain) })),
    );
  }

  /**
   * Connects a managed site's domain: when the team's OVH account manages it, its apex and `www`
   * are pointed at the server (other records untouched) and the project's expiry comes from OVH.
   * Never throws: OVH or RDAP failures leave things as they were.
   */
  async connect(projectId: string, domain: string): Promise<DomainConnection> {
    let managed = false;
    if (this.ovh.configured) {
      try {
        managed = await this.ovh.manages(domain);
        const ip = this.config.sitesServerIp;
        if (managed && ip && (await this.ovh.pointAt(domain, ip))) {
          const row = await this.repository.find(projectId);
          await this.activity.record(
            { id: null, name: 'OVH' },
            {
              action: 'project.domain_dns_updated',
              targetId: projectId,
              targetLabel: row?.name ?? domain,
              details: { domain, target: ip },
            },
          );
        }
      } catch (error) {
        this.logger.warn(`OVH connection of ${domain} failed: ${String(error)}`);
      }
    }
    const row = await this.repository.find(projectId);
    if (row?.domainName === domain && row.domainSource !== 'MANUAL') {
      await this.refresh(row).catch((error: unknown) =>
        this.logger.warn(`Expiry of ${domain} not read: ${String(error)}`),
      );
    }
    if (managed) return { managed, registered: true };
    const available = await this.isAvailable(domain);
    return { managed, registered: available === null ? null : !available };
  }

  /** Refreshes RDAP dates older than a day and sends the reminders due. Never throws. */
  async runDue(now = new Date()): Promise<void> {
    try {
      for (let row of await this.repository.watched()) {
        try {
          const stale =
            !row.domainCheckedAt ||
            now.getTime() - row.domainCheckedAt.getTime() > RECHECK_AFTER_MS;
          if (row.domainSource !== 'MANUAL' && stale) row = await this.refresh(row, now);
          await this.remind(row, now);
        } catch (error) {
          this.logger.error(`Domain check of ${row.domainName} failed: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Domain run failed: ${String(error)}`);
    }
  }

  private async isAvailable(domain: string): Promise<boolean | null> {
    const cached = this.availabilityCache.get(domain);
    if (cached && Date.now() - cached.at < AVAILABILITY_TTL_MS) return cached.available;
    let available: boolean | null = null;
    if (this.ovh.configured) {
      available = await this.ovh.available(domain).catch((error: unknown) => {
        this.logger.warn(`OVH availability of ${domain} failed: ${String(error)}`);
        return null;
      });
    }
    if (available === null) {
      try {
        const url = rdapUrl(await this.rdapBootstrap(), domain);
        if (url) {
          const response = await fetch(url, {
            headers: { Accept: 'application/rdap+json', 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(10_000),
          });
          available = availableFromRdap(response.status);
        }
      } catch (error) {
        this.logger.warn(`RDAP availability of ${domain} failed: ${String(error)}`);
      }
    }
    if (this.availabilityCache.size > 1000) this.availabilityCache.clear();
    this.availabilityCache.set(domain, { available, at: Date.now() });
    return available;
  }

  /**
   * Reads the expiry again: from OVH when the team's account manages the domain (the source
   * becomes OVH), else from RDAP (a domain OVH no longer manages goes back to RDAP).
   */
  private async refresh(row: DomainRow, now = new Date()): Promise<DomainRow> {
    if (this.ovh.configured) {
      try {
        if (await this.ovh.manages(row.domainName!)) {
          const expiresAt = await this.ovh.expiry(row.domainName!);
          return await this.repository.update(row.id, {
            domainSource: 'OVH',
            domainCheckedAt: now,
            ...(expiresAt ? { domainExpiresAt: new Date(`${expiresAt}T00:00:00Z`) } : {}),
          });
        }
      } catch (error) {
        this.logger.warn(`OVH expiry of ${row.domainName} failed: ${String(error)}`);
        if (row.domainSource === 'OVH') return row;
      }
    }
    if (row.domainSource === 'OVH') {
      row = await this.repository.update(row.id, { domainSource: 'RDAP' });
    }
    return this.checkRdap(row, now);
  }

  /** IANA's list of RDAP servers, kept a day. */
  private async rdapBootstrap(): Promise<RdapBootstrap> {
    if (this.bootstrap && Date.now() - this.bootstrap.at < RECHECK_AFTER_MS)
      return this.bootstrap.data;
    const response = await fetch(BOOTSTRAP_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`IANA bootstrap answered ${response.status}`);
    this.bootstrap = { data: (await response.json()) as RdapBootstrap, at: Date.now() };
    return this.bootstrap.data;
  }

  /** Asks the registry's RDAP server; a TLD without RDAP keeps what was known. */
  private async checkRdap(row: DomainRow, now = new Date()): Promise<DomainRow> {
    let expiresAt: string | null = null;
    try {
      const url = rdapUrl(await this.rdapBootstrap(), row.domainName!);
      const response = url
        ? await fetch(url, {
            headers: { Accept: 'application/rdap+json', 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(10_000),
          })
        : undefined;
      if (response?.ok) expiresAt = expiryFromRdap(await response.json());
    } catch (error) {
      this.logger.warn(`RDAP of ${row.domainName} didn't answer: ${String(error)}`);
    }
    return this.repository.update(row.id, {
      domainCheckedAt: now,
      ...(expiresAt ? { domainExpiresAt: new Date(`${expiresAt}T00:00:00Z`) } : {}),
    });
  }

  private async remind(row: DomainRow, now: Date): Promise<void> {
    if (!row.domainName || !row.domainExpiresAt) return;
    const day = row.domainExpiresAt.toISOString().slice(0, 10);
    const due = reminderDue(day, now, row.domainWarnedFor);
    if (!due) return;
    const domain = {
      name: row.domainName,
      project: row.name,
      expiresAt: day,
      days: daysUntil(day, now),
    };
    const site = this.config.siteUrl;
    await this.mail.send(
      domainTeamEmail(
        this.config.leadsNotifyTo,
        domain,
        `${site}/es/admin/projects/${row.id}#domain`,
        site,
      ),
    );
    for (const person of await this.accounts.people(row.clientId)) {
      await this.mail
        .send(
          domainClientEmail(
            person,
            domain,
            `${site}/${person.locale}/portal/projects/${row.id}`,
            site,
          ),
        )
        .catch((error: unknown) =>
          this.logger.error(`Domain reminder to ${person.email} failed`, error),
        );
    }
    await this.repository.update(row.id, { domainWarnedFor: `${day}:${due}` });
  }

  private async find(projectId: string): Promise<DomainRow> {
    const row = await this.repository.find(projectId);
    if (!row) throw new NotFoundException('Project not found');
    return row;
  }

  private view(row: DomainRow, now = new Date()): DomainView {
    const expiresAt = row.domainExpiresAt?.toISOString().slice(0, 10) ?? null;
    return {
      name: row.domainName,
      source: row.domainSource,
      expiresAt,
      daysLeft: expiresAt ? daysUntil(expiresAt, now) : null,
      checkedAt: row.domainCheckedAt?.toISOString() ?? null,
    };
  }
}
