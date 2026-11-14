import { snapshotLocale } from '../../common/content-revisions.js';

/** A case study's content as a revision keeps it (`PortfolioSnapshot`, architecture 5). */
export type PortfolioSnapshot = {
  coverImageUrl: string | null;
  clientName: string | null;
  projectUrl: string | null;
  technologies: string[];
  services: string[];
  testimonialAuthor: string | null;
  translations: PortfolioSnapshotTranslation[];
};

export type PortfolioSnapshotTranslation = {
  locale: 'en' | 'es';
  title: string;
  summary: string;
  content: string;
  testimonialQuote: string | null;
  testimonialRole: string | null;
};

/** The parts of a stored case study a snapshot is made of. */
export interface PortfolioContentRow {
  coverImageUrl: string | null;
  clientName: string | null;
  projectUrl: string | null;
  technologies: string[];
  services: string[];
  testimonialAuthor: string | null;
  translations: {
    locale: string;
    title: string;
    summary: string;
    content: string;
    testimonialQuote: string | null;
    testimonialRole: string | null;
  }[];
}

/** The case study's content: no status, publication date, slug or order (they aren't content). */
export function portfolioSnapshot(item: PortfolioContentRow): PortfolioSnapshot {
  return {
    coverImageUrl: item.coverImageUrl,
    clientName: item.clientName,
    projectUrl: item.projectUrl,
    technologies: item.technologies,
    services: item.services,
    testimonialAuthor: item.testimonialAuthor,
    translations: item.translations.map((t) => ({
      locale: snapshotLocale(t.locale),
      title: t.title,
      summary: t.summary,
      content: t.content,
      testimonialQuote: t.testimonialQuote,
      testimonialRole: t.testimonialRole,
    })),
  };
}
