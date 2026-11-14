import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { Prisma, SiteNewsPost } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MediaService } from '../media/media.service.js';
import { ManagedSitesRepository, type SiteRow } from './managed-sites.repository.js';
import { ManagedSitesService, type SiteView } from './managed-sites.service.js';
import { PortalSitesService } from './portal-sites.service.js';
import { SiteBuilderClient } from './site-builder.client.js';
import {
  MAX_NEWS_POSTS,
  endOfMadridDay,
  isUniqueViolation,
  newsStatus,
  slugOf,
  uniqueSlug,
  type CreateNewsInput,
  type NewsListQuery,
  type SiteNewsPostView,
  type UpdateNewsInput,
} from './site-news.js';
import { SiteNewsRepository } from './site-news.repository.js';

const HOUR_MS = 3_600_000;

export type NewsPage = Paginated<SiteNewsPostView> & { enabled: boolean };
export type NewsPublishResult = SiteNewsPostView & { build?: 'OK' | 'FAILED' };

/**
 * The news of a managed site (architecture 8.2, decision 55): posts outside the site's
 * draft/publish cycle. Publishing, or changing a published post, rebuilds the live site from its
 * published content plus the published posts.
 */
@Injectable()
export class SiteNewsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SiteNewsService.name);
  private timer: NodeJS.Timeout | undefined;
  private expiring = false;

  constructor(
    private readonly repository: SiteNewsRepository,
    private readonly sitesRepository: ManagedSitesRepository,
    private readonly sites: ManagedSitesService,
    private readonly portal: PortalSitesService,
    private readonly builder: SiteBuilderClient,
    private readonly media: MediaService,
    private readonly activity: ActivityService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.rebuildExpired(), HOUR_MS);
    this.timer.unref();
    setTimeout(() => void this.rebuildExpired(), 180_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async list(caller: AuthUser, projectId: string, query: NewsListQuery): Promise<NewsPage> {
    const site = await this.portal.findOwn(caller, projectId);
    const now = new Date();
    const { rows, total } = await this.repository.list(
      site.id,
      query.status,
      now,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    return {
      ...paginate(
        rows.map((row) => this.view(site, row, now)),
        total,
        query.page,
        query.pageSize,
      ),
      enabled: site.newsEnabled,
    };
  }

  async get(caller: AuthUser, projectId: string, postId: string): Promise<SiteNewsPostView> {
    const site = await this.portal.findOwn(caller, projectId);
    return this.view(site, await this.findPost(site, postId), new Date());
  }

  /** A draft: nothing is built. */
  async create(
    caller: AuthUser,
    projectId: string,
    input: CreateNewsInput,
  ): Promise<SiteNewsPostView> {
    const site = await this.portal.findOwn(caller, projectId);
    if ((await this.repository.count(site.id)) >= MAX_NEWS_POSTS) {
      throw new BadRequestException(`A site can keep up to ${MAX_NEWS_POSTS} posts`);
    }
    if (input.photo) await this.assertPhoto(input.photo);
    const base = slugOf(input.title);
    const taken = await this.repository.slugsStartingWith(site.id, base);
    // Two posts with one title at once: the loser takes the next free address.
    for (let attempt = 0; ; attempt++) {
      const slug = uniqueSlug(base, taken);
      try {
        const post = await this.repository.create({
          siteId: site.id,
          slug,
          title: input.title,
          summary: input.summary,
          body: input.body,
          photo: input.photo ?? null,
          expiresAt: input.expiresAt ? endOfMadridDay(input.expiresAt) : null,
          authorId: caller.id,
        });
        await this.record(caller, 'site_news.created', site, post);
        return this.view(site, post, new Date());
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 4) throw error;
        taken.add(slug);
      }
    }
  }

  /** Saves the changes; a post that is online (before or after) rebuilds the site. */
  async update(
    caller: AuthUser,
    projectId: string,
    postId: string,
    input: UpdateNewsInput,
  ): Promise<SiteNewsPostView> {
    const site = await this.portal.findOwn(caller, projectId);
    const post = await this.findPost(site, postId);
    if (input.photo) await this.assertPhoto(input.photo);
    const data: Prisma.SiteNewsPostUncheckedUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.photo !== undefined ? { photo: input.photo } : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt ? endOfMadridDay(input.expiresAt) : null }
        : {}),
    };
    const now = new Date();
    // Nothing to change: nothing is saved, logged or built.
    if (Object.keys(data).length === 0) return this.view(site, post, now);
    const nextExpiry =
      input.expiresAt !== undefined ? (data.expiresAt as Date | null) : post.expiresAt;
    const wasLive = newsStatus(post, now) === 'PUBLISHED';
    const willBeLive =
      newsStatus({ publishedAt: post.publishedAt, expiresAt: nextExpiry }, now) === 'PUBLISHED';
    if (wasLive || willBeLive) this.assertBuilder();
    const updated = await this.repository.update(postId, data);
    await this.record(caller, 'site_news.updated', site, updated);
    if (wasLive || willBeLive) await this.rebuild(projectId);
    return this.view(site, updated, now);
  }

  async remove(caller: AuthUser, projectId: string, postId: string): Promise<void> {
    const site = await this.portal.findOwn(caller, projectId);
    const post = await this.findPost(site, postId);
    const live = newsStatus(post, new Date()) === 'PUBLISHED';
    if (live) this.assertBuilder();
    await this.repository.remove(postId);
    await this.record(caller, 'site_news.deleted', site, post);
    if (live) await this.rebuild(projectId);
  }

  /** Sets `publishedAt` (kept when it already had one) and rebuilds the site. */
  async publish(caller: AuthUser, projectId: string, postId: string): Promise<NewsPublishResult> {
    const site = await this.portal.findOwn(caller, projectId);
    const post = await this.findPost(site, postId);
    const now = new Date();
    if (post.expiresAt && post.expiresAt.getTime() < now.getTime()) {
      throw new ConflictException('The expiry date has passed: choose a later one');
    }
    this.assertBuilder();
    const published = post.publishedAt
      ? post
      : await this.repository.update(postId, { publishedAt: now });
    if (!post.publishedAt) await this.record(caller, 'site_news.published', site, published);
    const built = await this.rebuild(projectId);
    return { ...this.view(site, published, now), build: buildResult(built) };
  }

  /** Clears `publishedAt`; the site is rebuilt when the post was online. */
  async unpublish(caller: AuthUser, projectId: string, postId: string): Promise<NewsPublishResult> {
    const site = await this.portal.findOwn(caller, projectId);
    const post = await this.findPost(site, postId);
    const now = new Date();
    const live = newsStatus(post, now) === 'PUBLISHED';
    if (live) this.assertBuilder();
    if (!post.publishedAt) return this.view(site, post, now);
    const draft = await this.repository.update(postId, { publishedAt: null });
    await this.record(caller, 'site_news.unpublished', site, draft);
    if (!live) return this.view(site, draft, now);
    return { ...this.view(site, draft, now), build: buildResult(await this.rebuild(projectId)) };
  }

  /** Switches the section on or off; the site is rebuilt. */
  async setEnabled(
    caller: AuthUser,
    projectId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    const site = await this.portal.findOwn(caller, projectId);
    this.assertBuilder();
    await this.sitesRepository.update(site.id, { newsEnabled: enabled });
    await this.activity.record(caller, {
      action: 'site_news.switched',
      targetId: projectId,
      targetLabel: site.project.name,
      details: { project: site.project.name, enabled },
    });
    await this.rebuild(projectId);
    return { enabled };
  }

  /**
   * Rebuilds the sites whose published post expired after their last build, which hides it
   * (architecture 4.6): those whose expiry is after the start of their last successful build.
   * Idempotent: a successful build moves `newsBuiltAt` past the expiry; a failed one is retried. Never throws.
   */
  async rebuildExpired(now = new Date()): Promise<number> {
    if (this.expiring) return 0;
    this.expiring = true;
    let rebuilt = 0;
    try {
      for (const site of await this.repository.sitesWithExpiredPosts(now)) {
        const since = site.newsBuiltAt?.getTime() ?? 0;
        if (!site.newsPosts.some((post) => (post.expiresAt?.getTime() ?? 0) > since)) continue;
        try {
          await this.rebuild(site.projectId);
          rebuilt += 1;
        } catch (error) {
          this.logger.warn(
            `Could not rebuild ${site.projectId} for expired news: ${String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Could not look for expired news', error);
    } finally {
      this.expiring = false;
    }
    return rebuilt;
  }

  /** One build per site at a time, folded by `ManagedSitesService.build`. */
  private rebuild(projectId: string): Promise<SiteView> {
    return this.sites.build(projectId);
  }

  /** Posts that go online need the builder: without it nothing is changed. */
  private assertBuilder(): void {
    if (!this.builder.isConfigured()) {
      throw new ServiceUnavailableException('The site builder is not configured');
    }
  }

  private async assertPhoto(photo: string): Promise<void> {
    if (!(await this.media.exists(photo.slice('media/'.length)))) {
      throw new BadRequestException('That photo is not one of the uploaded images');
    }
  }

  private async findPost(site: SiteRow, postId: string): Promise<SiteNewsPost> {
    const post = await this.repository.find(site.id, postId);
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private async record(
    actor: AuthUser,
    action:
      | 'site_news.created'
      | 'site_news.updated'
      | 'site_news.published'
      | 'site_news.unpublished'
      | 'site_news.deleted',
    site: SiteRow,
    post: SiteNewsPost,
  ): Promise<void> {
    await this.activity.record(actor, {
      action,
      targetId: post.id,
      targetLabel: post.title,
      details: { project: site.project.name, projectId: site.projectId },
    });
  }

  private view(site: SiteRow, post: SiteNewsPost, now: Date): SiteNewsPostView {
    const status = newsStatus(post, now);
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      body: post.body,
      photo: post.photo ? { file: post.photo, url: `${this.config.siteUrl}/${post.photo}` } : null,
      status,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      expiresAt: post.expiresAt?.toISOString() ?? null,
      url: status === 'PUBLISHED' ? `${this.sites.addressOf(site)}/noticias/${post.slug}` : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }
}

function buildResult(view: SiteView): 'OK' | 'FAILED' {
  return view.status === 'FAILED' ? 'FAILED' : 'OK';
}
