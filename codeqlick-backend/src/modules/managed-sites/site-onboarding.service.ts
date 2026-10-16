import { ConflictException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { LeadsService } from '../leads/leads.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { UsersService } from '../users/users.service.js';
import { ManagedSitesRepository } from './managed-sites.repository.js';
import type { OnboardSiteInput } from './managed-sites.schemas.js';
import { siteRequestSchema, type SiteRequest } from './site-request.js';
import { ManagedSitesService, type SiteView } from './managed-sites.service.js';
import { SiteDomainsService } from './site-domains.service.js';
import { SitePreviewsService } from './site-previews.service.js';

export interface OnboardResult {
  projectId: string;
  client: { id: string; created: boolean; invitationSent?: boolean };
  site: SiteView;
  monitoring: boolean;
}

/**
 * A basic-website client in one step: their account (or the lead's), the project, the managed
 * site from a preset (which brings the site form and the first build) and its uptime monitor.
 */
@Injectable()
export class SiteOnboardingService {
  constructor(
    private readonly users: UsersService,
    private readonly projects: ProjectsService,
    private readonly leads: LeadsService,
    private readonly sites: ManagedSitesService,
    private readonly monitoring: MonitoringService,
    private readonly repository: ManagedSitesRepository,
    private readonly siteDomains: SiteDomainsService,
    private readonly previews: SitePreviewsService,
  ) {}

  async onboard(actor: AuthUser, input: OnboardSiteInput): Promise<OnboardResult> {
    // Checked first, so a taken name doesn't leave an account and a project behind.
    if (await this.repository.findBySlugOrDomain(input.slug, input.domain ?? null)) {
      throw new ConflictException('Another site already uses that name or domain');
    }

    let projectId: string;
    let client: OnboardResult['client'];
    let request: SiteRequest | undefined;
    if (input.leadId) {
      const lead = await this.leads.get(input.leadId);
      const stored = siteRequestSchema
        .pick({ preset: true, business: true, domain: true })
        .safeParse(lead.siteRequest);
      request = stored.success ? stored.data : undefined;
      const converted = await this.leads.convert(actor, input.leadId, {
        projectName: input.businessName,
      });
      projectId = converted.project.id;
      client = converted.client;
    } else {
      client = await this.users.findOrCreateClient(actor, {
        email: input.email,
        name: input.name,
        locale: input.locale,
      });
      projectId = (
        await this.projects.create(actor, {
          clientId: client.id,
          name: input.businessName,
          phase: 'DESIGN',
          progress: 0,
        })
      ).id;
    }

    const site = await this.sites.create(
      actor,
      projectId,
      { slug: input.slug, preset: input.preset, domain: input.domain ?? null },
      request,
    );
    // The preview is served within a minute (deploy/sites/sync-sites.sh); a client domain may
    // still lack its DNS record, so its monitor is turned on once it answers.
    if (site.domain) this.siteDomains.checkSoon(projectId);
    // The real site replaces the request's preview.
    if (input.leadId) {
      await this.previews.remove(input.leadId).catch(() => undefined /* the daily job retries */);
    }
    const monitoring = !site.domain;
    if (monitoring) await this.monitoring.setEnabled(actor, projectId, true);
    return { projectId, client, site, monitoring };
  }
}
