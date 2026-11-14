import { getCollection, type CollectionEntry } from 'astro:content';
import { GROUPS, LANGS, otherLang, type Group, type Lang } from './i18n';

export interface DocPage {
  lang: Lang;
  /** `index` is the introduction, served at `/<lang>/`. */
  slug: string;
  title: string;
  description: string;
  group: Group;
  order: number;
  url: string;
  entry: CollectionEntry<'docs'>;
}

export type Docs = Record<Lang, DocPage[]>;

export const pageUrl = (lang: Lang, slug: string): string =>
  slug === 'index' ? `/${lang}/` : `/${lang}/${slug}/`;

async function load(): Promise<Docs> {
  const entries = await getCollection('docs');
  const problems: string[] = [];
  const all: Record<Lang, Map<string, DocPage>> = { en: new Map(), es: new Map() };

  for (const entry of entries) {
    // `entry.id` is `<lang>/<slug>`.
    const parts = entry.id.split('/');
    const lang = parts[0] as Lang;
    if (parts.length !== 2 || !LANGS.includes(lang)) {
      problems.push(`${entry.id}: pages go in src/content/docs/<en|es>/<slug>.md (no subfolders)`);
      continue;
    }
    const slug = parts[1]!;
    all[lang].set(slug, {
      lang,
      slug,
      title: entry.data.title,
      description: entry.data.description,
      group: entry.data.group,
      order: entry.data.order,
      url: pageUrl(lang, slug),
      entry,
    });
  }

  // The two languages must have the same slugs, and a page and its twin the same `draft`.
  for (const lang of LANGS) {
    const other = otherLang(lang);
    for (const [slug, page] of all[lang]) {
      const twin = all[other].get(slug);
      if (!twin) {
        problems.push(`${lang}/${slug}.md has no twin ${other}/${slug}.md`);
      } else if (twin.entry.data.draft !== page.entry.data.draft) {
        problems.push(`${lang}/${slug}.md and ${other}/${slug}.md differ in "draft"`);
      }
    }
  }
  for (const lang of LANGS) {
    const intro = all[lang].get('index');
    if (!intro || intro.entry.data.draft) {
      problems.push(
        `${lang}/index.md (the introduction, served at /${lang}/) must exist and be published`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(`Documentation content problems:\n- ${problems.join('\n- ')}`);
  }

  const docs: Docs = { en: [], es: [] };
  for (const lang of LANGS) {
    docs[lang] = [...all[lang].values()]
      .filter((page) => !page.entry.data.draft)
      .sort(
        (a, b) =>
          GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) ||
          a.order - b.order ||
          a.slug.localeCompare(b.slug),
      );
  }
  return docs;
}

let cache: Promise<Docs> | undefined;

/**
 * Published pages (no drafts) of both languages, in sidebar order. Throws when the languages
 * don't have the same slugs, so a missing translation fails the build.
 */
export function getDocs(): Promise<Docs> {
  // In `astro dev` the content changes under us.
  if (import.meta.env.DEV) return load();
  return (cache ??= load());
}

export function twinOf(docs: Docs, page: DocPage): DocPage | undefined {
  const other = otherLang(page.lang);
  return docs[other].find((p) => p.slug === page.slug);
}
