import 'server-only';
import type { Metadata } from 'next';
import { OG_LOCALES, SITE_LOCALES, routing, type AppLocale } from '@/i18n/routing';
import { BRANDS } from '@/lib/brand';
import { env } from '@/lib/env';
import { requestBrand } from '@/lib/request-brand';

/** An image for `og:image`: a URL, or a URL with its size and alt text. */
export type OgImage = string | { url: string; width: number; height: number; alt: string };

/**
 * The image to share a page with: its cover when it has one, otherwise the preview generated at
 * `generatedPath` (a route rendering the title with `renderOgImage`).
 */
export function shareImage(
  coverImageUrl: string | null,
  generatedPath: string,
  alt: string,
): OgImage {
  return coverImageUrl ?? { url: generatedPath, width: 1200, height: 630, alt };
}

/** Absolute URL on this site, e.g. absoluteUrl('/en/blog') → https://codeqlick.com/en/blog */
export function absoluteUrl(path: string): string {
  return `${env.SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Canonical + hreflang alternates for a locale-less path (`''` for home, `/blog`, `/blog/x`).
 * Relative URLs resolve against `metadataBase` (set in the [locale] layout).
 */
export function localeAlternates(
  locale: string,
  path = '',
  locales: readonly string[] = SITE_LOCALES,
): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `/${l}${path}`;
  languages['x-default'] = `/${routing.defaultLocale}${path}`;
  return { canonical: `/${locale}${path}`, languages };
}

/**
 * Metadata for a page: title, description, alternates and Open Graph basics, in the brand of the
 * request's host (Neoqlick's pages list all six languages, Codeqlick's two).
 */
export async function pageMetadata({
  locale,
  path = '',
  title,
  description,
  noindex = false,
  images,
}: {
  locale: string;
  path?: string;
  title?: string;
  description?: string;
  noindex?: boolean;
  images?: OgImage[];
}): Promise<Metadata> {
  const brand = BRANDS[await requestBrand()];
  return {
    title,
    description,
    alternates: localeAlternates(
      locale,
      path,
      brand.id === 'neoqlick' ? routing.locales : SITE_LOCALES,
    ),
    // Page-level openGraph replaces the layout's object, so repeat the shared fields here.
    openGraph: {
      type: 'website',
      siteName: brand.name,
      title,
      description,
      url: `/${locale}${path}`,
      locale: OG_LOCALES[locale as AppLocale] ?? OG_LOCALES.en,
      images: images && images.length > 0 ? images : [brand.ogImage],
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
