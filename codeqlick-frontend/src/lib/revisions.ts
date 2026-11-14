import type {
  AdminPortfolioItem,
  AdminPost,
  Locale,
  PortfolioSnapshot,
  PostSnapshot,
} from '@/lib/api/types';

/**
 * Field-by-field comparison of a post's or case study's revision with its current content
 * (decision 72), for the admin's revision page. Pure: labels are resolved by the page.
 */

/** How a value is shown: one line, long Markdown, an image URL or a list of names. */
export type FieldKind = 'text' | 'markdown' | 'image' | 'list';

/** A value as shown: text ('' when empty) or the names of a list. */
export type FieldValue = string | string[];

export type FieldRow = {
  /** The field's message key (in the item's admin namespace). */
  field: string;
  kind: FieldKind;
  revision: FieldValue;
  current: FieldValue;
  changed: boolean;
};

export type LanguageRows = { locale: Locale; rows: FieldRow[] };

/** Fields shared by both languages, then each language's fields. */
export type RevisionDiff = { shared: FieldRow[]; languages: LanguageRows[] };

const LOCALES: readonly Locale[] = ['en', 'es'];

const text = (value: string | null | undefined) => value ?? '';

function textRow(field: string, kind: FieldKind, revision: string, current: string): FieldRow {
  return { field, kind, revision, current, changed: revision !== current };
}

/** Lists compare item by item; `unordered` ignores their order (like the API does with tags). */
function listRow(
  field: string,
  revision: readonly string[],
  current: readonly string[],
  options: { unordered?: boolean; label?: (value: string) => string } = {},
): FieldRow {
  const key = (values: readonly string[]) =>
    JSON.stringify(options.unordered ? values.toSorted() : values);
  const label = options.label ?? ((value: string) => value);
  return {
    field,
    kind: 'list',
    revision: revision.map(label),
    current: current.map(label),
    changed: key(revision) !== key(current),
  };
}

/** English first, then Spanish: the languages either side has. */
function languagesOf(...sides: { locale: Locale }[][]): Locale[] {
  return LOCALES.filter((locale) =>
    sides.some((translations) => translations.some((item) => item.locale === locale)),
  );
}

function translationIn<T extends { locale: Locale }>(translations: T[], locale: Locale) {
  return translations.find((item) => item.locale === locale);
}

/** `tagName` names a tag id (a tag deleted since gets a placeholder from the page). */
export function postRevisionDiff(
  snapshot: PostSnapshot,
  current: AdminPost,
  tagName: (id: string) => string,
): RevisionDiff {
  const revisionTags = snapshot.tagIds ?? [];
  return {
    shared: [
      textRow('coverImageUrl', 'image', text(snapshot.coverImageUrl), text(current.coverImageUrl)),
      listRow('tags', revisionTags, current.tagIds, { unordered: true, label: tagName }),
    ],
    languages: languagesOf(snapshot.translations, current.translations).map((locale) => {
      const before = translationIn(snapshot.translations, locale);
      const now = translationIn(current.translations, locale);
      return {
        locale,
        rows: [
          textRow('postTitle', 'text', text(before?.title), text(now?.title)),
          textRow('excerpt', 'text', text(before?.excerpt), text(now?.excerpt)),
          textRow('content', 'markdown', text(before?.content), text(now?.content)),
        ],
      };
    }),
  };
}

/** `serviceName` names a service key. */
export function portfolioRevisionDiff(
  snapshot: PortfolioSnapshot,
  current: AdminPortfolioItem,
  serviceName: (key: string) => string,
): RevisionDiff {
  const shared: FieldRow[] = [
    textRow('coverImageUrl', 'image', text(snapshot.coverImageUrl), text(current.coverImageUrl)),
    textRow('clientName', 'text', text(snapshot.clientName), text(current.clientName)),
    textRow('projectUrl', 'text', text(snapshot.projectUrl), text(current.projectUrl)),
    listRow('technologies', snapshot.technologies ?? [], current.technologies),
    listRow('services', snapshot.services ?? [], current.services, { label: serviceName }),
    textRow(
      'testimonialAuthor',
      'text',
      text(snapshot.testimonialAuthor),
      text(current.testimonialAuthor),
    ),
  ];
  return {
    shared,
    languages: languagesOf(snapshot.translations, current.translations).map((locale) => {
      const before = translationIn(snapshot.translations, locale);
      const now = translationIn(current.translations, locale);
      return {
        locale,
        rows: [
          textRow('itemTitle', 'text', text(before?.title), text(now?.title)),
          textRow('summary', 'text', text(before?.summary), text(now?.summary)),
          textRow('content', 'markdown', text(before?.content), text(now?.content)),
          textRow(
            'testimonialQuote',
            'text',
            text(before?.testimonialQuote),
            text(now?.testimonialQuote),
          ),
          textRow(
            'testimonialRole',
            'text',
            text(before?.testimonialRole),
            text(now?.testimonialRole),
          ),
        ],
      };
    }),
  };
}

/** Whether anything differs between the revision and the current content. */
export function hasChanges(diff: RevisionDiff): boolean {
  return [...diff.shared, ...diff.languages.flatMap((language) => language.rows)].some(
    (row) => row.changed,
  );
}
