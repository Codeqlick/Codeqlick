import type { ImageMetadata } from 'astro';
import content from '@site/site';
import type { SectionKey, Site, SiteImage } from '../types';
import { type Lang, ui } from './i18n';

export type { Lang };

/** The site as written, in Spanish (its main language). */
export const site: Site = content;

/** The site has an English version under `/en` (architecture 8.2). */
export const english = site.english === true;

/** The languages its pages are built in. */
export const langs: Lang[] = english ? ['es', 'en'] : ['es'];

/** `getStaticPaths` of the English pages (`src/pages/[lang]/`): none without English. */
export const englishPaths = () => (english ? [{ params: { lang: 'en' } }] : []);

/**
 * `base` with the texts of `over` where they are written: an empty or missing English text keeps
 * the Spanish one, and only paths the Spanish content has are read (lists by position).
 */
export function translate<T>(base: T, over: unknown): T {
  if (typeof base === 'string') {
    return (typeof over === 'string' && over.trim() ? over : base) as T;
  }
  if (Array.isArray(base)) {
    const list = Array.isArray(over) ? over : [];
    return base.map((item, i) => translate(item, list[i])) as T;
  }
  if (base !== null && typeof base === 'object') {
    const from = over !== null && typeof over === 'object' ? (over as Record<string, unknown>) : {};
    return Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, translate(value, from[key])]),
    ) as T;
  }
  return base;
}

/** The Citas page in English: `https://citas.…/es/<slug>` becomes `…/en/<slug>`. */
const bookingIn = (url: string, lang: Lang) =>
  lang === 'en' ? url.replace(/^(https?:\/\/citas\.[^/]+)\/es\//, '$1/en/') : url;

const englishSite: Site | undefined = english
  ? (() => {
      const translated = translate(site, site.en);
      return translated.booking
        ? {
            ...translated,
            booking: { ...translated.booking, url: bookingIn(site.booking!.url, 'en') },
          }
        : translated;
    })()
  : undefined;

/** The site in a language: the English texts over the Spanish ones. */
export const siteIn = (lang: Lang): Site => (lang === 'en' && englishSite) || site;

/** The draft's base path (`/site-draft/<key>`), or ''. */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * A page's address without the base path, `.html` or a trailing `/index`: `/`, `/carta`,
 * `/en/noticias/2`… (what visitors see; the build's `Astro.url` ends in `.html`).
 */
export function pathOf(url: URL): string {
  let path = url.pathname;
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length);
  path = path.replace(/\.html$/, '').replace(/\/index$/, '');
  return path.startsWith('/') ? path : `/${path}`;
}

/** The language of a page: English under `/en`. */
export const langOf = (url: URL): Lang => {
  const path = pathOf(url);
  return english && (path === '/en' || path.startsWith('/en/')) ? 'en' : 'es';
};

/** The address of a Spanish page in a language: `/carta` → `/en/carta`, `/` → `/en`. */
export function localize(href: string, lang: Lang): string {
  if (lang === 'es' || !href.startsWith('/') || href.startsWith('//')) return href;
  return href === '/' ? '/en' : href.startsWith('/#') ? `/en${href.slice(1)}` : `/en${href}`;
}

/** A page's twin in the other language (its Spanish address without `/en`). */
export function twinOf(path: string, lang: Lang): string {
  const spanish = path === '/en' ? '/' : path.startsWith('/en/') ? path.slice(3) : path;
  return localize(spanish, lang);
}

const DEFAULT_ORDER: SectionKey[] = ['services', 'about', 'gallery', 'testimonials'];

/** The middle sections the site has, in its order (any it leaves out keep their default place). */
export const sectionOrder: SectionKey[] = [
  ...new Set([...(site.sections ?? []), ...DEFAULT_ORDER]),
].filter((key) => site[key] !== undefined);

/** `data-edit` of a text in a draft (the editor patches it live); nothing on a real site. */
export const editIn = (lang: Lang) => (path: string) =>
  site.draft ? (lang === 'en' ? `en.${path}` : path) : undefined;

/** Spanish `data-edit`, for parts that are only in Spanish. */
export const edit = editIn('es');

/** A section's label in the header and above its title ("Trabajos", "Sobre mí"…). */
export const sectionLabel = (key: SectionKey, lang: Lang = 'es') =>
  siteIn(lang).navLabels?.[key] ?? ui[lang].sections[key];

/**
 * Everything a component needs for the page it is on: the site in the page's language, its
 * words, `data-edit` paths and internal links in that language.
 */
export function pageOf(url: URL) {
  const lang = langOf(url);
  return {
    lang,
    site: siteIn(lang),
    t: ui[lang],
    edit: editIn(lang),
    href: (path: string) => localize(path, lang),
  };
}

const images = import.meta.glob<{ default: ImageMetadata }>(
  '@site/images/*.{jpg,jpeg,png,webp,avif}',
  {
    eager: true,
  },
);

/** The optimisable image behind a `SiteImage` (fails the build when the file is missing). */
export function imageOf(image: SiteImage): ImageMetadata {
  const entry = Object.entries(images).find(([path]) => path.endsWith(`/images/${image.file}`));
  if (!entry) throw new Error(`Image not found in images/: ${image.file}`);
  return entry[1].default;
}

/** `tel:` link of a phone written for people ("600 11 22 33"); inert on a demo. */
export const telHref = (phone: string) =>
  site.demo ? '#contacto' : `tel:${phone.replace(/[^\d+]/g, '')}`;

/** WhatsApp chat link, optionally with a first message; inert on a demo. */
export const whatsappHref = (number: string, text?: string) =>
  site.demo
    ? '#contacto'
    : `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Spanish addresses: "Calle Mayor 3, 28013 Madrid". */
export function addressLine(address: NonNullable<Site['contact']['address']>): string {
  return `${address.street}, ${address.postalCode ? `${address.postalCode} ` : ''}${address.city}`;
}
