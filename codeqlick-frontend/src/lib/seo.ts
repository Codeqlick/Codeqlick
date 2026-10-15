import 'server-only';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';

export const DEFAULT_OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Codeqlick — Redefining information technology in society',
};

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
export function localeAlternates(locale: string, path = ''): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = `/${l}${path}`;
  languages['x-default'] = `/${routing.defaultLocale}${path}`;
  return { canonical: `/${locale}${path}`, languages };
}

/** Metadata for a page: title, description, alternates and Open Graph basics. */
export function pageMetadata({
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
}): Metadata {
  return {
    title,
    description,
    alternates: localeAlternates(locale, path),
    // Page-level openGraph replaces the layout's object, so repeat the shared fields here.
    openGraph: {
      type: 'website',
      siteName: 'Codeqlick',
      title,
      description,
      url: `/${locale}${path}`,
      locale: locale === 'es' ? 'es_ES' : 'en_US',
      images: images && images.length > 0 ? images : [DEFAULT_OG_IMAGE],
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
