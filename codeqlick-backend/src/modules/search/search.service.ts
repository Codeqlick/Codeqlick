import { Injectable } from '@nestjs/common';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { pickTranslation } from '../../common/translations.js';
import {
  SearchRepository,
  type CaseStudyHit,
  type NumberedHit,
  type PostHit,
} from './search.repository.js';

export type AdminSearchKind =
  | 'lead'
  | 'user'
  | 'project'
  | 'ticket'
  | 'proposal'
  | 'post'
  | 'caseStudy';

export interface AdminSearchItem {
  id: string;
  label: string;
  /** Data only (names, emails, numbers, slugs), never words to translate. */
  sublabel: string | null;
}

export interface AdminSearch {
  /** As searched (trimmed). */
  q: string;
  /** Only kinds with matches, in the order of `AdminSearchKind`. */
  groups: { kind: AdminSearchKind; items: AdminSearchItem[] }[];
}

/** Matches per kind. */
export const SEARCH_LIMIT = 5;

/** A request or proposal number, with or without `#`. */
const NUMBER = /^#?(\d{1,9})$/;

/** `12` and `#12` are the number 12; anything else is not a number. */
export function searchNumber(q: string): number | undefined {
  const match = NUMBER.exec(q);
  return match ? Number(match[1]) : undefined;
}

const numbered = (hit: NumberedHit): AdminSearchItem => ({
  id: hit.id,
  label: hit.title,
  sublabel: `#${hit.number} · ${hit.client.name}`,
});

/** Admin search across seven kinds of record (architecture 4.14). */
@Injectable()
export class SearchService {
  constructor(private readonly repo: SearchRepository) {}

  async search(rawQ: string, locale: ApiLocale): Promise<AdminSearch> {
    const q = rawQ.trim();
    const terms = { q, number: searchNumber(q), take: SEARCH_LIMIT };
    const [leads, users, projects, tickets, proposals, posts, caseStudies] = await Promise.all([
      this.repo.leads(terms),
      this.repo.users(terms),
      this.repo.projects(terms),
      this.repo.tickets(terms),
      this.repo.proposals(terms),
      this.repo.posts(terms),
      this.repo.caseStudies(terms),
    ]);
    // The title in `locale`, else English; the slug only if it has no translation at all.
    const title = (hit: PostHit | CaseStudyHit) =>
      pickTranslation(hit.translations, locale)?.title ?? hit.slug;

    const groups: AdminSearch['groups'] = [
      {
        kind: 'lead',
        items: leads.map((lead) => ({
          id: lead.id,
          label: lead.name,
          sublabel: [lead.company, lead.email].filter(Boolean).join(' · ') || null,
        })),
      },
      {
        kind: 'user',
        items: users.map((user) => ({ id: user.id, label: user.name, sublabel: user.email })),
      },
      {
        kind: 'project',
        items: projects.map((project) => ({
          id: project.id,
          label: project.name,
          sublabel: project.client.name,
        })),
      },
      { kind: 'ticket', items: tickets.map(numbered) },
      { kind: 'proposal', items: proposals.map(numbered) },
      {
        kind: 'post',
        items: posts.map((post) => ({ id: post.id, label: title(post), sublabel: post.slug })),
      },
      {
        kind: 'caseStudy',
        items: caseStudies.map((item) => ({
          id: item.id,
          label: title(item),
          sublabel: item.clientName || item.slug,
        })),
      },
    ];
    return { q, groups: groups.filter((group) => group.items.length > 0) };
  }
}
