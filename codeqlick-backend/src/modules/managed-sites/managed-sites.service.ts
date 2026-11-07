import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { DomainsService } from '../domains/domains.service.js';
import { SiteFormsService } from '../site-forms/site-forms.service.js';
import { UmamiClient } from '../stats/umami.client.js';
import { ManagedSitesRepository, type SiteRow } from './managed-sites.repository.js';
import {
  siteContentSchema,
  type CreateSiteInput,
  type SiteContent,
  type UpdateSiteInput,
} from './managed-sites.schemas.js';
import { SiteBuilderClient } from './site-builder.client.js';
import { contentFromRequest, type SiteRequest } from './site-request.js';

export interface SiteView {
  projectId: string;
  project: { id: string; name: string };
  client: { id: string; name: string };
  slug: string;
  preset: string;
  domain: string | null;
  /** Where the domain stands (architecture 8.2); null without one or before its first check. */
  domainState: 'UNREGISTERED' | 'ELSEWHERE' | 'LIVE' | null;
  domainCheckedAt: string | null;
  /** Where the domain's email goes (architecture 11.1); null without a registered domain. */
  mailState: 'NONE' | 'OVH' | 'OTHER' | null;
  previewUrl: string;
  /** The live address: the domain once it serves the site, the preview until then. */
  url: string;
  status: 'NONE' | 'BUILDING' | 'LIVE' | 'FAILED';
  lastBuildAt: string | null;
  lastBuildError: string | null;
  release: string | null;
  content: SiteContent;
  updatedAt: string;
}

export interface SiteRevisionView {
  id: string;
  createdAt: string;
  author: { name: string } | null;
}

/**
 * Managed sites (architecture 8.2 and 11.3): content stored here, built by site-builder from the
 * web-basica template every time it changes, served at the preview subdomain and the client's
 * domain.
 */
@Injectable()
export class ManagedSitesService {
  private readonly logger = new Logger(ManagedSitesService.name);

  constructor(
    private readonly repository: ManagedSitesRepository,
    private readonly builder: SiteBuilderClient,
    private readonly forms: SiteFormsService,
    private readonly activity: ActivityService,
    private readonly config: AppConfigService,
    private readonly umami: UmamiClient,
    private readonly domains: DomainsService,
  ) {}

  async list(): Promise<SiteView[]> {
    return (await this.repository.list()).map((row) => this.view(row));
  }

  async get(projectId: string): Promise<SiteView | null> {
    await this.findProject(projectId);
    const row = await this.repository.findByProject(projectId);
    return row ? this.view(row) : null;
  }

  /**
   * Starts a site from a preset, with the project's and client's names (and a website request's
   * business details, when there is one), and builds it.
   */
  async create(
    actor: AuthUser,
    projectId: string,
    input: CreateSiteInput,
    request?: SiteRequest,
  ): Promise<SiteView> {
    const project = await this.findProject(projectId);
    if (await this.repository.findByProject(projectId)) {
      throw new ConflictException('The project already has a site');
    }
    if (input.domain) this.assertOwnDomain(input.domain);
    await this.assertFree(input.slug, input.domain ?? null);

    const preset = (await this.builder.presets()).find((item) => item.key === input.preset);
    if (!preset) throw new InternalServerErrorException('The site builder has no such preset');
    const { url: _url, form: _form, demo: _demo, footerNote: _note, ...base } = preset.content;
    const parsed = siteContentSchema.safeParse({
      ...base,
      business: { ...(base.business as object), name: project.name },
      legal: {
        owner: project.client.name,
        taxId: '',
        address: '',
        email: project.client.email,
      },
    });
    if (!parsed.success) {
      this.logger.error(`Preset ${input.preset} doesn't match the content schema`, parsed.error);
      throw new InternalServerErrorException('The preset does not match the content schema');
    }
    // A request's business is applied last; if it doesn't fit the schema, the preset's stays.
    const fromRequest = request
      ? siteContentSchema.safeParse(contentFromRequest(parsed.data, request))
      : undefined;
    if (fromRequest && !fromRequest.success) {
      this.logger.warn(`Request content of ${input.slug} skipped: ${fromRequest.error.message}`);
    }
    const content = fromRequest?.success ? fromRequest.data : parsed.data;

    const row = await this.repository.create({
      projectId,
      slug: input.slug,
      preset: input.preset,
      domain: input.domain ?? null,
      content: content as Prisma.InputJsonValue,
    });
    await this.syncProject(row);
    if (!(await this.forms.get(projectId))) {
      await this.forms.save(actor, projectId, {
        enabled: true,
        recipients: [project.client.email],
      });
    }
    await this.activity.record(actor, {
      action: 'project.site_created',
      targetId: projectId,
      targetLabel: project.name,
      details: { slug: row.slug, preset: row.preset },
    });
    return this.build(projectId);
  }

  /** Replaces the content (keeping the previous one as a revision) and publishes it. */
  async updateContent(
    actor: AuthUser,
    projectId: string,
    content: SiteContent,
    action: 'project.site_updated' | 'project.site_restored' = 'project.site_updated',
    /** Another style to start from (the editor's draft), whose photos the content may use. */
    preset?: string,
  ): Promise<SiteView> {
    const site = await this.findSite(projectId);
    await this.repository.addRevision(site.id, site.content as Prisma.InputJsonValue, actor.id);
    await this.repository.update(site.id, {
      content: content as Prisma.InputJsonValue,
      ...(preset ? { preset } : {}),
    });
    await this.activity.record(actor, {
      action,
      targetId: projectId,
      targetLabel: site.project.name,
    });
    return this.build(projectId);
  }

  async updateSettings(
    actor: AuthUser,
    projectId: string,
    input: UpdateSiteInput,
  ): Promise<SiteView> {
    const site = await this.findSite(projectId);
    if (input.domain && input.domain !== site.domain) {
      this.assertOwnDomain(input.domain);
      if (await this.repository.findByDomain(input.domain))
        throw new ConflictException('Another site already uses that domain');
    }
    const changed = input.domain !== site.domain;
    const row = await this.repository.update(site.id, {
      domain: input.domain,
      ...(changed ? { domainState: null, domainCheckedAt: null, mailState: null } : {}),
    });
    await this.syncProject(row);
    await this.activity.record(actor, {
      action: 'project.site_updated',
      targetId: projectId,
      targetLabel: site.project.name,
      details: { domain: input.domain },
    });
    return this.build(projectId);
  }

  /** The domain now serves the site (or stopped): the project's URLs follow and it is rebuilt. */
  async addressChanged(projectId: string): Promise<SiteView> {
    await this.syncProject(await this.findSite(projectId));
    return this.build(projectId);
  }

  /** Builds the current content and publishes it; a failed build keeps the previous release. */
  async build(projectId: string): Promise<SiteView> {
    const site = await this.findSite(projectId);
    await this.repository.update(site.id, { status: 'BUILDING' });
    const form = await this.forms.get(projectId);
    const websiteId = await this.analyticsOf(site);
    const result = await this.builder.build({
      slug: site.slug,
      preset: site.preset,
      domains: this.domainsOf(site),
      content: {
        ...(site.content as Record<string, unknown>),
        url: this.urlOf(site),
        demo: false,
        ...(form?.enabled ? { form: { key: form.key, api: this.config.publicApiUrl } } : {}),
        ...(websiteId ? { analytics: { websiteId, scriptUrl: this.config.umamiScriptUrl } } : {}),
      },
    });
    const row = await this.repository.update(
      site.id,
      result.ok
        ? { status: 'LIVE', lastBuildAt: new Date(), lastBuildError: null, release: result.release }
        : { status: 'FAILED', lastBuildAt: new Date(), lastBuildError: result.error.slice(-4000) },
    );
    if (!result.ok) this.logger.warn(`Build of ${site.slug} failed: ${result.error.slice(-500)}`);
    return this.view(row);
  }

  /**
   * Takes the site down (architecture 8.2): the builder marks it for removal, so the host
   * unpublishes its domains and folder, and then it is deleted.
   */
  async remove(actor: AuthUser, projectId: string): Promise<void> {
    const project = await this.findProject(projectId);
    const site = await this.findSite(projectId);
    await this.builder.remove(site.slug);
    await this.builder.removeDraft(site.slug);
    await this.repository.remove(site.id, projectId);
    await this.activity.record(actor, {
      action: 'project.site_deleted',
      targetId: projectId,
      targetLabel: project.name,
      details: { slug: site.slug, ...(site.domain ? { domain: site.domain } : {}) },
    });
  }

  async revisions(projectId: string): Promise<SiteRevisionView[]> {
    const site = await this.findSite(projectId);
    return (await this.repository.revisions(site.id)).map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      author: row.author,
    }));
  }

  async restore(actor: AuthUser, projectId: string, revisionId: string): Promise<SiteView> {
    const site = await this.findSite(projectId);
    const revision = await this.repository.findRevision(site.id, revisionId);
    if (!revision) throw new NotFoundException('Revision not found');
    const parsed = siteContentSchema.safeParse(revision.content);
    if (!parsed.success) throw new ConflictException('That revision no longer matches the schema');
    return this.updateContent(actor, projectId, parsed.data, 'project.site_restored');
  }

  /**
   * The site's Umami website, created the first time (named after the project); undefined when
   * Umami isn't set up or doesn't answer: the site is built without statistics then.
   */
  private async analyticsOf(site: SiteRow): Promise<string | undefined> {
    if (site.umamiWebsiteId) return site.umamiWebsiteId;
    if (!this.config.umamiApi) return undefined;
    try {
      const id = await this.umami.createWebsite(
        site.project.name,
        site.domain ?? `${site.slug}.${this.config.sitesPreviewDomain}`,
      );
      await this.repository.update(site.id, { umamiWebsiteId: id });
      return id;
    } catch (error) {
      this.logger.warn(`No visit statistics for ${site.slug}: ${String(error)}`);
      return undefined;
    }
  }

  private previewUrlOf(site: { slug: string }): string {
    return `https://${site.slug}.${this.config.sitesPreviewDomain}`;
  }

  /** The site's address: its domain once LIVE, its preview until then. */
  addressOf(site: Pick<SiteRow, 'slug' | 'domain' | 'domainState'>): string {
    return this.urlOf(site);
  }

  private urlOf(site: Pick<SiteRow, 'slug' | 'domain' | 'domainState'>): string {
    return site.domain && site.domainState === 'LIVE'
      ? `https://${site.domain}`
      : this.previewUrlOf(site);
  }

  /** What Nginx publishes once it points here (deploy/sites/sync-sites.sh): `www` included. */
  private domainsOf(site: { slug: string; domain: string | null }): string[] {
    return [
      `${site.slug}.${this.config.sitesPreviewDomain}`,
      ...(site.domain
        ? [site.domain, ...(site.domain.startsWith('www.') ? [] : [`www.${site.domain}`])]
        : []),
    ];
  }

  /**
   * The project's staging and production URLs (what the form and the monitor accept/check), and
   * its domain's renewal is watched once it has one.
   */
  private async syncProject(site: SiteRow): Promise<void> {
    await this.repository.setProjectUrls(site.projectId, this.previewUrlOf(site), this.urlOf(site));
    if (site.domain) await this.domains.adopt(site.projectId, site.domain.replace(/^www\./, ''));
  }

  /** The previews and the platform's own domain aren't a client's to take. */
  private assertOwnDomain(domain: string): void {
    const bare = domain.replace(/^www\./, '');
    const reserved = [this.config.sitesPreviewDomain, new URL(this.config.siteUrl).hostname].map(
      (name) => name.replace(/^www\./, ''),
    );
    if (reserved.some((name) => bare === name || bare.endsWith(`.${name}`))) {
      throw new BadRequestException('That domain belongs to Codeqlick');
    }
  }

  private async assertFree(slug: string, domain: string | null): Promise<void> {
    const taken = await this.repository.findBySlugOrDomain(slug, domain);
    if (taken) {
      throw new ConflictException(
        taken.slug === slug
          ? 'Another site already uses that name'
          : 'Another site already uses that domain',
      );
    }
  }

  private async findProject(id: string) {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async findSite(projectId: string): Promise<SiteRow> {
    const site = await this.repository.findByProject(projectId);
    if (!site) throw new NotFoundException('The project has no managed site');
    return site;
  }

  private view(row: SiteRow): SiteView {
    return {
      projectId: row.projectId,
      project: { id: row.project.id, name: row.project.name },
      client: { id: row.project.client.id, name: row.project.client.name },
      slug: row.slug,
      preset: row.preset,
      domain: row.domain,
      domainState: row.domainState,
      domainCheckedAt: row.domainCheckedAt?.toISOString() ?? null,
      mailState: row.mailState,
      previewUrl: this.previewUrlOf(row),
      url: this.urlOf(row),
      status: row.status,
      lastBuildAt: row.lastBuildAt?.toISOString() ?? null,
      lastBuildError: row.lastBuildError,
      release: row.release,
      content: row.content as SiteContent,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
