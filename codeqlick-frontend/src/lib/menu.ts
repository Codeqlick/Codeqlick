/**
 * Menu (menu.codeqlick.com, architecture 4.20): the shapes of the API and the pure helpers the
 * public page, the editor and the actions share. No `server-only`: Client Components use it too.
 */

export const MENU_ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type MenuAllergen = (typeof MENU_ALLERGENS)[number];

export const MENU_KINDS = ['MENU', 'CATALOGUE'] as const;
export type MenuKind = (typeof MENU_KINDS)[number];

/** The language of a menu's own texts, as the API writes it. */
export type MenuLanguage = 'EN' | 'ES';
export const MENU_LANGUAGES: readonly MenuLanguage[] = ['EN', 'ES'];

export const MENU_CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'MXN', 'COP', 'ARS', 'CLP'] as const;
export type MenuCurrency = (typeof MENU_CURRENCIES)[number];

export const MENU_REPORT_REASONS = [
  'ILLEGAL',
  'PHISHING',
  'IMPERSONATION',
  'COPYRIGHT',
  'SEXUAL',
  'SPAM',
  'OTHER',
] as const;
export type MenuReportReason = (typeof MENU_REPORT_REASONS)[number];

/** The slug's rules (architecture 4.20): 3-40 characters, lowercase, digits and single dashes. */
export const MENU_SLUG_MIN = 3;
export const MENU_SLUG_MAX = 40;

export type MenuItem = {
  key?: string;
  name: string;
  description?: string;
  price?: string;
  allergens?: MenuAllergen[];
  hidden?: boolean;
  soldOut?: boolean;
};

export type MenuCategory = { key?: string; name: string; items: MenuItem[] };
export type MenuContent = { categories: MenuCategory[] };

/** `GET /menus/p/:slug`: what the public page shows (hidden items already left out). */
export type PublicMenu = {
  slug: string;
  kind: MenuKind;
  businessName: string;
  language: MenuLanguage;
  currency: MenuCurrency;
  title: string;
  intro: string;
  address: string;
  openingNote: string;
  note: string;
  indexable: boolean;
  showBadge: boolean;
  content: MenuContent;
};

/** The texts of a menu, as the editor edits them. */
export type MenuSettings = {
  slug: string;
  kind: MenuKind;
  businessName: string;
  language: MenuLanguage;
  currency: MenuCurrency;
  title: string;
  intro: string;
  address: string;
  openingNote: string;
  note: string;
  enabled: boolean;
  indexable: boolean;
};

export type MenuView = MenuSettings & {
  id: string;
  url: string;
  suspended: boolean;
  suspendedReason: string | null;
  revision: number;
  content: MenuContent;
  redirects: { slug: string; expiresAt: string }[];
  createdAt: string;
  updatedAt: string;
};

export type MenuSummary = {
  id: string;
  slug: string;
  kind: MenuKind;
  businessName: string;
  enabled: boolean;
  suspended: boolean;
  updatedAt: string;
};

export type MenuLimits = {
  menus: number;
  categories: number;
  itemsPerCategory: number;
  showBadge: boolean;
};

/** The page's title when the owner doesn't write one: "Menu"/"Carta", "Catalogue"/"Catálogo". */
export function defaultTitle(kind: MenuKind, language: MenuLanguage): string {
  if (kind === 'CATALOGUE') return language === 'ES' ? 'Catálogo' : 'Catalogue';
  return language === 'ES' ? 'Carta' : 'Menu';
}

/** A menu's language as the website's locale (routes and `<html lang>`). */
export function menuLocale(language: MenuLanguage): 'en' | 'es' {
  return language === 'ES' ? 'es' : 'en';
}

/** The website's locale as a menu language. */
export function languageOfLocale(locale: string): MenuLanguage {
  return locale === 'es' ? 'ES' : 'EN';
}

const PRICE_ONLY = /^\d{1,9}(?:[.,]\d{1,2})?$/;

/**
 * A price for the page: a price that is only a number (`12`, `12.5`, `12,50`) is written for the
 * menu's language with its currency's symbol; any other text is shown exactly as typed.
 */
export function formatMenuPrice(
  price: string | undefined,
  currency: string,
  language: MenuLanguage,
): string {
  const text = (price ?? '').trim();
  if (!text) return '';
  if (!PRICE_ONLY.test(text)) return text;
  const value = Number(text.replace(',', '.'));
  try {
    return new Intl.NumberFormat(language === 'ES' ? 'es-ES' : 'en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return text;
  }
}

/**
 * "Contains: gluten, milk": the allergen names in words, in the regulation's order. An empty
 * list gives an empty string: the page never claims "allergen-free".
 */
export function allergenText(
  allergens: readonly string[] | undefined,
  names: Readonly<Record<MenuAllergen, string>>,
  prefix: string,
  locale: string,
): string {
  const list = MENU_ALLERGENS.filter((allergen) => allergens?.includes(allergen));
  if (list.length === 0) return '';
  return `${prefix} ${list.map((allergen) => names[allergen].toLocaleLowerCase(locale)).join(', ')}`;
}

/** The categories the public page shows: hidden items and then empty categories left out. */
export function visibleCategories(content: MenuContent): MenuCategory[] {
  return content.categories
    .map((category) => ({ ...category, items: category.items.filter((item) => !item.hidden) }))
    .filter((category) => category.items.length > 0);
}

/** Letters without accents, the way the editor suggests a link from a name. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '');
}

/** What a link may hold, while it is typed: lowercase, spaces as dashes, nothing else. */
export function normalizeSlugInput(raw: string): string {
  return plain(raw)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MENU_SLUG_MAX);
}

/** The link suggested from a business name (`Café Ñam!` → `cafe-nam`). */
export function suggestSlug(name: string): string {
  return normalizeSlugInput(name).replace(/^-+|-+$/g, '');
}

export function isValidMenuSlug(slug: string): boolean {
  return (
    slug.length >= MENU_SLUG_MIN &&
    slug.length <= MENU_SLUG_MAX &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

/** Moves the item at `from` to `to` (a new array); out-of-range moves change nothing. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** One of the API's 422 field errors. */
export type FieldIssue = { path: string; message: string };

/**
 * The API's 422 errors by field: content paths lose their `content.` prefix, so
 * `content.categories.0.items.1.name` is `categories.0.items.1.name` (what the editor's fields
 * look up); other paths (`slug`, `businessName`…) are kept. The first message of a path wins.
 */
export function mapIssuePaths(issues: readonly FieldIssue[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const path = (issue.path || '_form').replace(/^content\./, '');
    if (!(path in result)) result[path] = issue.message;
  }
  return result;
}

export type IssueKind =
  'reserved' | 'links' | 'taken' | 'required' | 'tooLong' | 'invalid' | 'other';

/**
 * What an API error message (English) is about, so the editor can say it in the person's
 * language; `other` keeps the API's own words.
 */
export function issueKind(message: string): IssueKind {
  if (/reserved/i.test(message)) return 'reserved';
  if (/link|https?:|www\./i.test(message)) return 'links';
  if (/taken|already (?:in use|exists)/i.test(message)) return 'taken';
  if (/too long|at most|no more than|exceed|maximum/i.test(message)) return 'tooLong';
  if (/required|at least|too short|empty|must not be blank/i.test(message)) return 'required';
  if (/invalid|lowercase|format|control char/i.test(message)) return 'invalid';
  return 'other';
}

/** The keys of the field errors that belong to the content, for "N problems below". */
export function contentIssueCount(errors: Record<string, string>): number {
  return Object.keys(errors).filter((path) => path.startsWith('categories')).length;
}

/** A menu's address on its host: the short link the QR carries. */
export function shortLink(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/${slug}`;
}

/** The words every menu page shows, already in the page's language (labels of `MenuView`). */
export type MenuLabels = {
  jump: string;
  soldOut: string;
  contains: string;
  allergenNote: string;
  madeWith: string;
  allergens: Record<MenuAllergen, string>;
};

/**
 * The page's fixed words from the `Menu` namespace (`view.*` and `allergens.*`): `t` is a
 * translator of that namespace, from `getTranslations` or `useTranslations`.
 */
export function buildMenuLabels(t: (key: string) => string): MenuLabels {
  return {
    jump: t('view.jump'),
    soldOut: t('view.soldOut'),
    contains: t('view.contains'),
    allergenNote: t('view.allergenNote'),
    madeWith: t('view.madeWith'),
    allergens: Object.fromEntries(
      MENU_ALLERGENS.map((allergen) => [allergen, t(`allergens.${allergen}`)]),
    ) as Record<MenuAllergen, string>,
  };
}

/**
 * A normalised copy of the editor's content for the API: no client ids, no empty optionals, and
 * no allergens on a catalogue.
 */
export function contentForApi(content: MenuContent, kind: MenuKind = 'MENU'): MenuContent {
  return {
    categories: content.categories.map((category) => ({
      ...(category.key ? { key: category.key } : {}),
      name: category.name.trim(),
      items: category.items.map((item) => {
        const description = item.description?.trim();
        const price = item.price?.trim();
        return {
          ...(item.key ? { key: item.key } : {}),
          name: item.name.trim(),
          ...(description ? { description } : {}),
          ...(price ? { price } : {}),
          ...(kind === 'MENU' && item.allergens && item.allergens.length > 0
            ? { allergens: item.allergens }
            : {}),
          ...(item.hidden ? { hidden: true } : {}),
          ...(item.soldOut ? { soldOut: true } : {}),
        };
      }),
    })),
  };
}
