import { Injectable } from '@nestjs/common';
import type { Locale, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** What one search looks for, as the service prepared it. */
export interface SearchTerms {
  /** Trimmed text, matched anywhere. */
  q: string;
  /** A request or proposal number when `q` is one (`12`, `#12`). */
  number?: number;
  /** Rows per kind. */
  take: number;
}

export interface LeadHit {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}
export interface UserHit {
  id: string;
  name: string;
  email: string;
}
export interface ProjectHit {
  id: string;
  name: string;
  client: { name: string };
}
export interface NumberedHit {
  id: string;
  number: number;
  title: string;
  client: { name: string };
}
export interface PostHit {
  id: string;
  slug: string;
  translations: { locale: Locale; title: string }[];
}
export interface CaseStudyHit {
  id: string;
  slug: string;
  clientName: string | null;
  translations: { locale: Locale; title: string }[];
}

/** Most recently changed first; `id` keeps ties stable. */
const RECENT_FIRST = [{ updatedAt: 'desc' }, { id: 'desc' }] as const;

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

const clientMatches = (q: string): Prisma.UserWhereInput => ({
  OR: [{ name: contains(q) }, { email: contains(q) }],
});

/**
 * Read-only queries of the admin search (architecture 4.14) over other domains' tables. Each
 * matches `q` case-insensitively on names, emails, titles and short identifiers only, and selects
 * only what the results show.
 */
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Spam included. */
  leads({ q, take }: SearchTerms): Promise<LeadHit[]> {
    return this.prisma.lead.findMany({
      where: { OR: [{ name: contains(q) }, { email: contains(q) }, { company: contains(q) }] },
      orderBy: [...RECENT_FIRST],
      take,
      select: { id: true, name: true, email: true, company: true },
    });
  }

  /** Every role and kind, deactivated accounts too. */
  users({ q, take }: SearchTerms): Promise<UserHit[]> {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { name: contains(q) },
          { email: contains(q) },
          // Usernames are stored lower-cased and shown as @name.
          { username: { contains: q.replace(/^@/, '').toLowerCase() } },
        ],
      },
      orderBy: [...RECENT_FIRST],
      take,
      select: { id: true, name: true, email: true },
    });
  }

  /** By name, domain, its managed site's domain or slug, or its client. */
  projects({ q, take }: SearchTerms): Promise<ProjectHit[]> {
    return this.prisma.clientProject.findMany({
      where: {
        OR: [
          { name: contains(q) },
          { domainName: contains(q) },
          { site: { is: { OR: [{ domain: contains(q) }, { slug: contains(q) }] } } },
          { client: { is: clientMatches(q) } },
        ],
      },
      orderBy: [...RECENT_FIRST],
      take,
      select: { id: true, name: true, client: { select: { name: true } } },
    });
  }

  /** Support requests by title, client or exact number. */
  tickets({ q, number, take }: SearchTerms): Promise<NumberedHit[]> {
    const or: Prisma.SupportTicketWhereInput[] = [
      { title: contains(q) },
      { client: { is: clientMatches(q) } },
    ];
    if (number !== undefined) or.push({ number });
    return this.prisma.supportTicket.findMany({
      where: { OR: or },
      orderBy: [...RECENT_FIRST],
      take,
      select: { id: true, number: true, title: true, client: { select: { name: true } } },
    });
  }

  /** Proposals by title, client or exact number. */
  proposals({ q, number, take }: SearchTerms): Promise<NumberedHit[]> {
    const or: Prisma.ProposalWhereInput[] = [
      { title: contains(q) },
      { client: { is: clientMatches(q) } },
    ];
    if (number !== undefined) or.push({ number });
    return this.prisma.proposal.findMany({
      where: { OR: or },
      orderBy: [...RECENT_FIRST],
      take,
      select: { id: true, number: true, title: true, client: { select: { name: true } } },
    });
  }

  /** By slug or any translation's title; drafts and scheduled ones too. */
  posts({ q, take }: SearchTerms): Promise<PostHit[]> {
    return this.prisma.post.findMany({
      where: {
        OR: [{ slug: contains(q) }, { translations: { some: { title: contains(q) } } }],
      },
      orderBy: [...RECENT_FIRST],
      take,
      select: { id: true, slug: true, translations: { select: { locale: true, title: true } } },
    });
  }

  /** Portfolio items by slug, client name or any translation's title; drafts too. */
  caseStudies({ q, take }: SearchTerms): Promise<CaseStudyHit[]> {
    return this.prisma.portfolioItem.findMany({
      where: {
        OR: [
          { slug: contains(q) },
          { clientName: contains(q) },
          { translations: { some: { title: contains(q) } } },
        ],
      },
      orderBy: [...RECENT_FIRST],
      take,
      select: {
        id: true,
        slug: true,
        clientName: true,
        translations: { select: { locale: true, title: true } },
      },
    });
  }
}
