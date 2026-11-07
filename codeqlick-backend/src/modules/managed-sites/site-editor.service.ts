import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ManagedSitesRepository, type SiteRow } from './managed-sites.repository.js';
import { siteContentSchema, sitePresetSchema, type SiteContent } from './managed-sites.schemas.js';
import { ManagedSitesService } from './managed-sites.service.js';
import { PortalSitesService } from './portal-sites.service.js';
import { SiteBuilderClient } from './site-builder.client.js';
import { applyStyle, changedSections } from './site-editing.js';

export type DraftPreviewStatus = 'READY' | 'FAILED' | 'MISSING';

/** The website editor (`GET /portal/projects/:id/site/draft`, architecture 8.2). */
export interface SiteEditorView {
  /** The draft's, or the published ones without a draft. */
  content: SiteContent;
  preset: string;
  /** The styles to start from, with their colours and fonts. */
  presets: Array<{ key: string; theme: SiteContent['theme'] }>;
  published: { content: SiteContent; preset: string };
  draft: {
    updatedAt: string;
    /** `/site-draft/<key>/`, served by the website. */
    previewUrl: string;
    previewStatus: DraftPreviewStatus;
    /** The end of the build log when the preview failed. */
    previewError?: string;
  } | null;
}

/** The style's demo content with the fields a site's content doesn't keep. */
function presetContent(content: Record<string, unknown>): Record<string, unknown> {
  const { url: _url, form: _form, demo: _demo, footerNote: _note, ...rest } = content;
  return rest;
}

/**
 * The client's draft of their whole site (decision 18): saved as they type, previewed by a draft
 * build of the template, published when they say so.
 */
@Injectable()
export class SiteEditorService {
  private readonly logger = new Logger(SiteEditorService.name);

  constructor(
    private readonly repository: ManagedSitesRepository,
    private readonly sites: ManagedSitesService,
    private readonly portal: PortalSitesService,
    private readonly builder: SiteBuilderClient,
  ) {}

  async view(caller: AuthUser, projectId: string): Promise<SiteEditorView> {
    const site = await this.portal.findOwn(caller, projectId);
    let status: DraftPreviewStatus = 'MISSING';
    if (site.draftContent && site.draftKey) {
      const index = await this.builder.draftFile(site.slug, '').catch(() => null);
      if (index) {
        await index.body?.cancel();
        status = 'READY';
      }
    }
    return this.toView(site, status);
  }

  /**
   * Saves the draft (the whole content, validated: 400 with every issue and nothing saved), and
   * builds its preview when asked to or when it has none yet.
   */
  async save(
    caller: AuthUser,
    projectId: string,
    input: { content: unknown; preset?: string; rebuild?: boolean },
  ): Promise<SiteEditorView> {
    const site = await this.portal.findOwn(caller, projectId);
    const parsed = siteContentSchema.safeParse(input.content);
    if (!parsed.success) {
      throw new BadRequestException({
        detail: 'The draft has errors',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const preset = input.preset ?? site.draftPreset ?? site.preset;
    const first = !site.draftContent || !site.draftKey;
    const row = await this.repository.update(site.id, {
      draftContent: parsed.data as Prisma.InputJsonValue,
      draftPreset: preset === site.preset ? null : preset,
      draftUpdatedAt: new Date(),
      draftKey: site.draftKey ?? randomBytes(24).toString('base64url'),
    });
    if (!(input.rebuild || first || preset !== (site.draftPreset ?? site.preset))) {
      return this.toView(row, 'READY');
    }
    return this.buildPreview(row);
  }

  /** The draft takes another style's colours, fonts, corners, order and photos; texts stay. */
  async applyStyle(caller: AuthUser, projectId: string, key: string): Promise<SiteEditorView> {
    const site = await this.portal.findOwn(caller, projectId);
    const preset = sitePresetSchema.parse(key);
    const found = (await this.builder.presets()).find((item) => item.key === preset);
    if (!found) throw new BadRequestException('No such style');
    const style = siteContentSchema.safeParse(presetContent(found.content));
    if (!style.success) throw new BadRequestException('That style cannot be applied');
    const current = (site.draftContent ?? site.content) as SiteContent;
    return this.save(caller, projectId, {
      content: applyStyle(current, style.data),
      preset,
      rebuild: true,
    });
  }

  /** Goes back to the published site: the draft and its preview are deleted. */
  async discard(caller: AuthUser, projectId: string): Promise<void> {
    const site = await this.portal.findOwn(caller, projectId);
    await this.repository.update(site.id, {
      draftContent: Prisma.DbNull,
      draftPreset: null,
      draftUpdatedAt: null,
      draftKey: null,
    });
    await this.builder.removeDraft(site.slug);
  }

  /** The draft goes online (a revision of the previous content); the team is told what changed. */
  async publish(caller: AuthUser, projectId: string): Promise<SiteEditorView> {
    const site = await this.portal.findOwn(caller, projectId);
    if (!site.draftContent) throw new ConflictException('There is no draft to publish');
    const content = siteContentSchema.parse(site.draftContent);
    const changed = changedSections(site.content as SiteContent, content);
    const result = await this.sites.updateContent(
      caller,
      projectId,
      content,
      'project.site_updated',
      site.draftPreset ?? undefined,
    );
    await this.discard(caller, projectId);
    if (changed.length > 0)
      this.portal.notifyTeam(site, caller, changed, result.status === 'FAILED');
    return this.view(caller, projectId);
  }

  /** A file of a draft's preview, by its key (the key is the secret); null when there is none. */
  async previewFile(key: string, path: string): Promise<Response | null> {
    if (!/^[\w-]{16,64}$/.test(key)) return null;
    const site = await this.repository.findByDraftKey(key);
    if (!site) return null;
    return this.builder.draftFile(site.slug, path);
  }

  private async buildPreview(site: SiteRow): Promise<SiteEditorView> {
    const result = await this.builder.buildDraft({
      slug: site.slug,
      preset: site.draftPreset ?? site.preset,
      base: `/site-draft/${site.draftKey!}`,
      content: {
        ...(site.draftContent as Record<string, unknown>),
        url: this.sites.addressOf(site),
        demo: false,
      },
    });
    if (!result.ok) {
      this.logger.warn(`Draft preview of ${site.slug} failed: ${result.error.slice(-300)}`);
      return this.toView(site, 'FAILED', result.error.slice(-2000));
    }
    return this.toView(site, 'READY');
  }

  private async toView(
    site: SiteRow,
    status: DraftPreviewStatus,
    error?: string,
  ): Promise<SiteEditorView> {
    const presets = await this.builder.presets().catch(() => []);
    const published = { content: site.content as SiteContent, preset: site.preset };
    return {
      content: (site.draftContent as SiteContent | null) ?? published.content,
      preset: site.draftPreset ?? site.preset,
      presets: presets.flatMap((item) => {
        const theme = siteContentSchema.shape.theme.safeParse(item.content.theme);
        return theme.success ? [{ key: item.key, theme: theme.data }] : [];
      }),
      published,
      draft:
        site.draftContent && site.draftKey && site.draftUpdatedAt
          ? {
              updatedAt: site.draftUpdatedAt.toISOString(),
              previewUrl: `/site-draft/${site.draftKey}/`,
              previewStatus: status,
              ...(error ? { previewError: error } : {}),
            }
          : null,
    };
  }
}
