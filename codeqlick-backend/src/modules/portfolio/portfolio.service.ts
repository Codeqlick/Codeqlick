import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toContentRevision, type ContentRevision } from '../../common/content-revisions.js';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { availableLocales, pickTranslation } from '../../common/translations.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { PublishStatus } from '../../generated/prisma/client.js';
import {
  ActivityService,
  contentLabel,
  publishVerb,
  scheduledDetails,
} from '../activity/activity.service.js';
import { publishedAtOnCreate, publishedAtOnUpdate } from '../../common/publishing.js';
import {
  PortfolioRepository,
  type AdminPortfolioRecord,
  type PortfolioTranslationData,
  type PortfolioUpdateData,
  type PortfolioWithTranslations,
} from './portfolio.repository.js';
import type { PortfolioSnapshot } from './portfolio-snapshot.js';
import {
  SERVICE_KEYS,
  portfolioSnapshotSchema,
  type CreatePortfolioInput,
  type ListAdminPortfolioQuery,
  type ListPublicPortfolioQuery,
  type PortfolioTranslationInput,
  type UpdatePortfolioInput,
} from './portfolio.schemas.js';

type ServiceKey = (typeof SERVICE_KEYS)[number];

export interface Testimonial {
  quote: string;
  author: string;
  role: string | null;
}

export interface PortfolioSummary {
  slug: string;
  title: string;
  summary: string;
  clientName: string | null;
  coverImageUrl: string | null;
  technologies: string[];
  services: string[];
  testimonial: Testimonial | null;
}

export interface PortfolioFilters {
  technologies: Array<{ name: string; count: number }>;
  services: Array<{ key: ServiceKey; count: number }>;
}

export interface PortfolioDetail extends PortfolioSummary {
  content: string;
  projectUrl: string | null;
  locales: ApiLocale[];
}

export interface AdminPortfolioItem {
  id: string;
  slug: string;
  status: PublishStatus;
  clientName: string | null;
  testimonialAuthor: string | null;
  projectUrl: string | null;
  coverImageUrl: string | null;
  technologies: string[];
  services: string[];
  sortOrder: number;
  translations: PortfolioTranslationInput[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Old slugs that redirect to this case study (decision 51), newest first. */
  oldSlugs: string[];
}

export type PortfolioRevisionDetail = ContentRevision & { snapshot: PortfolioSnapshot };

function toTranslationData(t: PortfolioTranslationInput): PortfolioTranslationData {
  return {
    locale: toDbLocale(t.locale),
    title: t.title,
    summary: t.summary,
    content: t.content,
    testimonialQuote: t.testimonialQuote || null,
    testimonialRole: t.testimonialRole || null,
  };
}

/** The testimonial in one language: needs an author and a quote in that language. */
function toTestimonial(
  item: PortfolioWithTranslations,
  translation: PortfolioWithTranslations['translations'][number],
): Testimonial | null {
  if (!item.testimonialAuthor || !translation.testimonialQuote) return null;
  return {
    quote: translation.testimonialQuote,
    author: item.testimonialAuthor,
    role: translation.testimonialRole,
  };
}

function toAdminItem(item: AdminPortfolioRecord): AdminPortfolioItem {
  return {
    id: item.id,
    slug: item.slug,
    status: item.status,
    clientName: item.clientName,
    testimonialAuthor: item.testimonialAuthor,
    projectUrl: item.projectUrl,
    coverImageUrl: item.coverImageUrl,
    technologies: item.technologies,
    services: item.services,
    sortOrder: item.sortOrder,
    translations: item.translations.map((t) => ({
      locale: toApiLocale(t.locale),
      title: t.title,
      summary: t.summary,
      content: t.content,
      testimonialQuote: t.testimonialQuote,
      testimonialRole: t.testimonialRole,
    })),
    publishedAt: item.publishedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    oldSlugs: item.slugRedirects.map((redirect) => redirect.slug),
  };
}

/** How many times each value appears. */
function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly repository: PortfolioRepository,
    private readonly activity: ActivityService,
  ) {}

  // ---- Public -------------------------------------------------------------------------

  async listPublished(query: ListPublicPortfolioQuery): Promise<Paginated<PortfolioSummary>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.listPublished(skip, take, {
      testimonialLocale: query.testimonials ? toDbLocale(query.locale) : undefined,
      technology: query.technology,
      service: query.service,
    });
    const summaries = items
      .map((item) => this.toSummary(item, query.locale))
      .filter((summary): summary is PortfolioSummary => summary !== undefined);
    return paginate(summaries, total, query.page, query.pageSize);
  }

  /** The filters the case study list offers: technologies and services in use, with counts. */
  async filters(): Promise<PortfolioFilters> {
    const rows = await this.repository.listLiveFacets();
    const technologies = countValues(rows.flatMap((row) => row.technologies));
    const services = countValues(rows.flatMap((row) => row.services));
    return {
      technologies: [...technologies]
        .map(([name, items]) => ({ name, count: items }))
        .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      services: SERVICE_KEYS.filter((key) => services.has(key)).map((key) => ({
        key,
        count: services.get(key) ?? 0,
      })),
    };
  }

  async getPublishedBySlug(slug: string, locale: ApiLocale): Promise<PortfolioDetail> {
    const item = await this.repository.findPublishedBySlug(slug);
    const translation = item ? pickTranslation(item.translations, locale) : undefined;
    if (!item || !translation) throw new NotFoundException('Portfolio item not found');
    return {
      slug: item.slug,
      title: translation.title,
      summary: translation.summary,
      clientName: item.clientName,
      coverImageUrl: item.coverImageUrl,
      technologies: item.technologies,
      services: item.services,
      testimonial: toTestimonial(item, translation),
      content: translation.content,
      projectUrl: item.projectUrl,
      locales: availableLocales(item.translations),
    };
  }

  /** The current slug of the live case study an old slug redirects to (decision 51). */
  async redirect(slug: string): Promise<{ slug: string }> {
    const current = await this.repository.findLiveSlugByRedirect(slug);
    if (!current) throw new NotFoundException('Redirect not found');
    return { slug: current };
  }

  // ---- Admin --------------------------------------------------------------------------

  async listAll(query: ListAdminPortfolioQuery): Promise<Paginated<AdminPortfolioItem>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.listAll(query.status, skip, take);
    return paginate(items.map(toAdminItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<AdminPortfolioItem> {
    return toAdminItem(await this.findOrThrow(id));
  }

  async create(actor: AuthUser, input: CreatePortfolioInput): Promise<AdminPortfolioItem> {
    const item = await this.repository.create({
      slug: input.slug,
      status: input.status,
      publishedAt: publishedAtOnCreate(input.status, input.publishedAt),
      clientName: input.clientName ?? null,
      testimonialAuthor: input.testimonialAuthor ?? null,
      projectUrl: input.projectUrl ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      technologies: input.technologies,
      services: input.services,
      sortOrder: input.sortOrder,
      translations: input.translations.map(toTranslationData),
    });
    const created = toAdminItem(item);
    await this.activity.record(actor, {
      action: 'portfolio.created',
      targetId: created.id,
      targetLabel: contentLabel(created),
      details: { status: created.status, ...scheduledDetails(created) },
    });
    return created;
  }

  async update(
    actor: AuthUser,
    id: string,
    input: UpdatePortfolioInput,
  ): Promise<AdminPortfolioItem> {
    const existing = await this.findOrThrow(id);
    const data: PortfolioUpdateData = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.clientName !== undefined) data.clientName = input.clientName;
    if (input.testimonialAuthor !== undefined) data.testimonialAuthor = input.testimonialAuthor;
    if (input.projectUrl !== undefined) data.projectUrl = input.projectUrl;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;
    if (input.technologies !== undefined) data.technologies = input.technologies;
    if (input.services !== undefined) data.services = input.services;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.status !== undefined) data.status = input.status;
    const publishedAt = publishedAtOnUpdate(existing, input.status, input.publishedAt);
    if (publishedAt !== undefined) data.publishedAt = publishedAt;
    if (input.translations !== undefined) {
      data.translations = input.translations.map(toTranslationData);
    }
    const updated = toAdminItem(await this.repository.update(id, data, actor.id));
    await this.activity.record(actor, {
      action: `portfolio.${publishVerb(existing, updated, input)}`,
      targetId: id,
      targetLabel: contentLabel(updated),
    });
    return updated;
  }

  // ---- Revisions (decision 52) --------------------------------------------------------

  async revisions(id: string): Promise<ContentRevision[]> {
    await this.findOrThrow(id);
    return (await this.repository.revisions(id)).map(toContentRevision);
  }

  async revision(id: string, revisionId: string): Promise<PortfolioRevisionDetail> {
    await this.findOrThrow(id);
    const revision = await this.repository.findRevision(id, revisionId);
    if (!revision) throw new NotFoundException('Revision not found');
    return {
      ...toContentRevision(revision),
      snapshot: revision.snapshot as unknown as PortfolioSnapshot,
    };
  }

  /**
   * Puts a revision's content back as a normal update, so the current content becomes a
   * revision itself. Status, publication date, slug and order stay.
   */
  async restore(actor: AuthUser, id: string, revisionId: string): Promise<AdminPortfolioItem> {
    await this.findOrThrow(id);
    const revision = await this.repository.findRevision(id, revisionId);
    if (!revision) throw new NotFoundException('Revision not found');
    const parsed = portfolioSnapshotSchema.safeParse(revision.snapshot);
    if (!parsed.success) throw new ConflictException('That revision no longer fits the schema');
    const snapshot = parsed.data;
    const data: PortfolioUpdateData = {
      coverImageUrl: snapshot.coverImageUrl,
      clientName: snapshot.clientName,
      projectUrl: snapshot.projectUrl,
      technologies: snapshot.technologies,
      services: snapshot.services,
      testimonialAuthor: snapshot.testimonialAuthor,
      translations: snapshot.translations.map(toTranslationData),
    };
    const updated = toAdminItem(await this.repository.update(id, data, actor.id));
    await this.activity.record(actor, {
      action: 'portfolio.restored',
      targetId: id,
      targetLabel: contentLabel(updated),
      details: { revisionCreatedAt: revision.createdAt.toISOString() },
    });
    return updated;
  }

  async delete(actor: AuthUser, id: string): Promise<void> {
    const existing = toAdminItem(await this.findOrThrow(id));
    await this.repository.delete(id);
    await this.activity.record(actor, {
      action: 'portfolio.deleted',
      targetId: id,
      targetLabel: contentLabel(existing),
    });
  }

  private async findOrThrow(id: string): Promise<AdminPortfolioRecord> {
    const item = await this.repository.findById(id);
    if (!item) throw new NotFoundException('Portfolio item not found');
    return item;
  }

  private toSummary(
    item: PortfolioWithTranslations,
    locale: ApiLocale,
  ): PortfolioSummary | undefined {
    const translation = pickTranslation(item.translations, locale);
    if (!translation) return undefined;
    return {
      slug: item.slug,
      title: translation.title,
      summary: translation.summary,
      clientName: item.clientName,
      coverImageUrl: item.coverImageUrl,
      technologies: item.technologies,
      services: item.services,
      testimonial: toTestimonial(item, translation),
    };
  }
}
