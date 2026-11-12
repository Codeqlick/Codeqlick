import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { CloudDomain } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import { CloudRepository } from './cloud.repository.js';
import type { CreateDomainInput } from './cloud.schemas.js';
import { CloudStorage } from './cloud.storage.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface DomainView {
  id: string;
  name: string;
  state: 'PENDING' | 'VERIFIED' | 'LIVE' | 'ERROR';
  dns: Array<{ type: 'TXT' | 'A' | 'CNAME'; name: string; value: string; ok: boolean }>;
  verifiedAt: string | null;
  checkedAt: string | null;
  lastError: string | null;
}

/** The outside world a domain check looks at; replaced in tests. */
@Injectable()
export class CloudDns {
  async txt(name: string): Promise<string[]> {
    try {
      return (await dns.resolveTxt(name)).map((parts) => parts.join(''));
    } catch {
      return [];
    }
  }

  async ipv4(name: string): Promise<string[]> {
    try {
      return await dns.resolve4(name);
    } catch {
      return [];
    }
  }

  /** Whether the domain answers over HTTPS with a valid certificate. */
  async https(name: string): Promise<boolean> {
    try {
      const response = await fetch(`https://${name}/`, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      return response.status < 500;
    } catch {
      return false;
    }
  }
}

const TEN_MINUTES = 10 * 60_000;
/** TXT record whose value proves the domain is the team's. */
export const verificationName = (domain: string) => `_codeqlick.${domain}`;

const under = (name: string, parent: string) => name === parent || name.endsWith(`.${parent}`);

/** Custom domains of Cloud projects (architecture 4.13). */
@Injectable()
export class CloudDomainsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudDomainsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repository: CloudRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly storage: CloudStorage,
    private readonly lookup: CloudDns,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.checkDue(), TEN_MINUTES).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async list(ctx: CloudCtx, projectId: string): Promise<DomainView[]> {
    const { project } = await this.projects.project(ctx, projectId);
    return (await this.repository.domains(project.id)).map((d) => this.view(d, project.slug));
  }

  async add(ctx: CloudCtx, projectId: string, input: CreateDomainInput): Promise<DomainView> {
    const { project, membership } = await this.projects.project(ctx, projectId);
    const name = input.name;
    const own = [
      this.config.cloudHosting?.domain ?? 'codeqlick.app',
      'codeqlick.com',
      this.config.sitesPreviewDomain,
    ];
    if (own.some((parent) => under(name, parent))) {
      throw new BadRequestException('That domain belongs to Codeqlick');
    }
    const limits = this.teams.limits(membership.team.plan);
    if ((await this.repository.countDomains(project.id)) >= limits.domainsPerProject) {
      throw new ConflictException(`A project has at most ${limits.domainsPerProject} domains`);
    }
    if (await this.repository.domainTaken(name))
      throw new ConflictException('That domain is already in use');
    const row = await this.repository.createDomain({
      projectId: project.id,
      name,
      verificationToken: randomBytes(18).toString('base64url'),
    });
    await this.teams.record(ctx, project.teamId, 'domain.added', name, { project: project.slug });
    return this.view(row, project.slug);
  }

  async check(ctx: CloudCtx, projectId: string, domainId: string): Promise<DomainView> {
    const { project } = await this.projects.project(ctx, projectId);
    const row = await this.repository.findDomain(project.id, domainId);
    if (!row) throw new NotFoundException('Domain not found');
    return this.view(await this.checkOne(row, project.slug), project.slug);
  }

  async remove(ctx: CloudCtx, projectId: string, domainId: string): Promise<void> {
    const { project } = await this.projects.project(ctx, projectId);
    const row = await this.repository.findDomain(project.id, domainId);
    if (!row) throw new NotFoundException('Domain not found');
    await this.storage.removeDomain(row.name);
    await this.repository.deleteDomain(row.id);
    await this.teams.record(ctx, project.teamId, 'domain.removed', row.name, {
      project: project.slug,
    });
  }

  /** Every 10 minutes: the domains whose check is due. */
  async checkDue(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const row of await this.repository.domainsDue(now)) {
        await this.checkOne(row, row.project.slug).catch((error: unknown) =>
          this.logger.warn(`Checking ${row.name} failed: ${String(error)}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Ownership first (the TXT record), then whether it resolves here: only then is it handed to
   * the host to publish, and it is LIVE once it answers over HTTPS.
   */
  async checkOne(row: CloudDomain, slug: string): Promise<CloudDomain> {
    const now = new Date();
    let verifiedAt = row.verifiedAt;
    if (!verifiedAt) {
      const values = await this.lookup.txt(verificationName(row.name));
      if (!values.includes(`cq-verify=${row.verificationToken}`)) {
        return this.repository.updateDomain(row.id, {
          state: 'PENDING',
          checkedAt: now,
          lastError: `The TXT record ${verificationName(row.name)} wasn't found yet`,
        });
      }
      verifiedAt = now;
    }
    const serverIp = this.config.sitesServerIp;
    const addresses = await this.lookup.ipv4(row.name);
    if (!serverIp || !addresses.includes(serverIp)) {
      return this.repository.updateDomain(row.id, {
        state: row.state === 'LIVE' || row.state === 'ERROR' ? 'ERROR' : 'VERIFIED',
        verifiedAt,
        checkedAt: now,
        lastError: `${row.name} doesn't point at Codeqlick yet`,
      });
    }
    if (this.storage.available) await this.storage.writeDomain(row.name, slug);
    const live = await this.lookup.https(row.name);
    return this.repository.updateDomain(row.id, {
      state: live ? 'LIVE' : row.state === 'LIVE' ? 'ERROR' : 'VERIFIED',
      verifiedAt,
      checkedAt: now,
      lastError: live ? null : 'Waiting for its HTTPS certificate (a few minutes)',
    });
  }

  view(row: CloudDomain, slug: string): DomainView {
    const subdomain = row.name.split('.').length > 2;
    const hosting = this.config.cloudHosting?.domain ?? 'codeqlick.app';
    const pointed = row.state === 'LIVE';
    return {
      id: row.id,
      name: row.name,
      state: row.state,
      dns: [
        {
          type: 'TXT',
          name: verificationName(row.name),
          value: `cq-verify=${row.verificationToken}`,
          ok: row.verifiedAt !== null,
        },
        subdomain
          ? { type: 'CNAME', name: row.name, value: `${slug}.${hosting}`, ok: pointed }
          : { type: 'A', name: row.name, value: this.config.sitesServerIp ?? '', ok: pointed },
      ],
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      checkedAt: row.checkedAt?.toISOString() ?? null,
      lastError: row.lastError,
    };
  }
}
