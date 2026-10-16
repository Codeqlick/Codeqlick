import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { renderEmail } from '../mail/email-layout.js';
import { MailService } from '../mail/mail.service.js';
import { detectImageType } from '../media/image-type.js';
import { MediaService } from '../media/media.service.js';
import { ManagedSitesRepository, type SiteRow } from './managed-sites.repository.js';
import { siteContentSchema, type EditableSite, type SiteContent } from './managed-sites.schemas.js';
import { ManagedSitesService } from './managed-sites.service.js';
import { applyEdits, changedParts, editableOf } from './site-editing.js';

export interface PortalSiteView {
  status: 'NONE' | 'BUILDING' | 'LIVE' | 'FAILED';
  /** The demo it started from: its photos are the gallery's other file names. */
  preset: string;
  url: string;
  lastBuildAt: string | null;
  editable: EditableSite;
}

/** Photos a site can use: the template optimises these. */
const SITE_IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'webp']);

/** The client's side of their managed site (architecture 11.5): edit it and add photos. */
@Injectable()
export class PortalSitesService {
  private readonly logger = new Logger(PortalSitesService.name);

  constructor(
    private readonly repository: ManagedSitesRepository,
    private readonly sites: ManagedSitesService,
    private readonly media: MediaService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async get(caller: AuthUser, projectId: string): Promise<PortalSiteView> {
    return this.view(await this.findOwn(caller, projectId));
  }

  /** Saves the client's edits into the content and publishes it; the team is told what changed. */
  async update(caller: AuthUser, projectId: string, edits: EditableSite): Promise<PortalSiteView> {
    const site = await this.findOwn(caller, projectId);
    const before = site.content as SiteContent;
    const parsed = siteContentSchema.safeParse(applyEdits(before, edits));
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid content');
    }
    const changed = changedParts(editableOf(before), editableOf(parsed.data));
    if (changed.length === 0) return this.view(site);

    const result = await this.sites.updateContent(caller, projectId, parsed.data);
    this.notifyTeam(site, caller, changed, result.status === 'FAILED');
    const row = await this.repository.findByProject(projectId);
    return this.view(row ?? site);
  }

  /** A photo for the site: stored with the uploaded images, referenced as `media/<file>`. */
  async uploadImage(
    caller: AuthUser,
    projectId: string,
    data: Buffer | undefined,
  ): Promise<{ file: string; url: string }> {
    await this.findOwn(caller, projectId);
    const type = data ? detectImageType(data) : undefined;
    if (data && data.length > 0 && (!type || !SITE_IMAGE_TYPES.has(type))) {
      throw new BadRequestException('Use a JPEG, PNG or WebP photo');
    }
    const uploaded = await this.media.upload(caller, data);
    return {
      file: `media/${uploaded.filename}`,
      url: `${this.config.siteUrl}/media/${uploaded.filename}`,
    };
  }

  private notifyTeam(site: SiteRow, caller: AuthUser, changed: string[], failed: boolean): void {
    const url = `${this.config.siteUrl}/es/admin/projects/${site.projectId}#site`;
    const intro = failed
      ? `${caller.name} changed the website of ${site.project.name}, but publishing it failed: the previous version is still online.`
      : `${caller.name} changed the website of ${site.project.name}. It is already published.`;
    void this.mail
      .send({
        to: this.config.leadsNotifyTo,
        replyTo: caller.email,
        subject: `[codeqlick] ${failed ? 'Publish failed' : 'Website changed'}: ${site.project.name}`,
        ...renderEmail(
          {
            locale: 'en',
            preheader: changed.join(', '),
            title: failed
              ? 'A client change could not be published'
              : 'A client changed their website',
            intro: [intro],
            details: [
              ['Changed', changed.join(', ')],
              ['Site', site.domain ?? `${site.slug}.${this.config.sitesPreviewDomain}`],
            ],
            button: { label: 'Open the project', url },
            signoff: [],
          },
          this.config.siteUrl,
        ),
      })
      .catch((error: unknown) => this.logger.error('Could not email the site change', error));
  }

  private async findOwn(caller: AuthUser, projectId: string): Promise<SiteRow> {
    const site = await this.repository.findByProject(projectId);
    const own = site && (caller.role === 'ADMIN' || site.project.client.id === accountOf(caller));
    if (!site || !own) throw new NotFoundException('Website not found');
    return site;
  }

  private view(site: SiteRow): PortalSiteView {
    const content = site.content as SiteContent;
    return {
      status: site.status,
      preset: site.preset,
      url: site.domain
        ? `https://${site.domain}`
        : `https://${site.slug}.${this.config.sitesPreviewDomain}`,
      lastBuildAt: site.lastBuildAt?.toISOString() ?? null,
      editable: editableOf(content),
    };
  }
}
