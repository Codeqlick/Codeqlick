import '@/styles/globals.css';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ErrorReporter } from '@/components/layout/ErrorReporter';
import { ClientMessages } from '@/i18n/ClientMessages';
import { resolveCruisingLocale } from '@/i18n/locale';
import { OG_LOCALES, SITE_LOCALES } from '@/i18n/routing';
import { env } from '@/lib/env';
import { localeAlternates } from '@/lib/seo';
import { fontVariablesFor } from '../fonts';
import { NeoqlickThemeLink } from '@/components/neoqlick/NeoqlickThemeLink';
import { BRANDS } from '@/lib/brand';
import { requestBrand } from '@/lib/request-brand';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

/** Built ahead in the website's languages; Cruising's own four render on demand (decision 103). */
export function generateStaticParams() {
  return SITE_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const brand = BRANDS[await requestBrand()];
  // Neoqlick's hosts: the portal's own origin (the apps set theirs); Codeqlick's: the website's.
  const origin = brand.id === 'neoqlick' && env.NEOQLICK_URL ? env.NEOQLICK_URL : env.SITE_URL;

  return {
    metadataBase: new URL(origin),
    title: { default: t('defaultTitle'), template: `%s — ${t('siteName')}` },
    description: t('description'),
    alternates: localeAlternates(locale),
    openGraph: {
      type: 'website',
      siteName: t('siteName'),
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `/${locale}`,
      locale: OG_LOCALES[locale],
      images: [brand.ogImage],
    },
    twitter: { card: 'summary_large_image' },
    icons: brand.icons,
    // ExoClick's ownership check for the video chat's ads (architecture 4.7); Neoqlick's sites
    // carry the tags of their own ExoClick sites when the owner registers them.
    ...(brand.id === 'codeqlick'
      ? { other: { '6a97888e-site-verification': '5e55aa28a6c9210038f92e69880e6449' } }
      : {}),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  // Every page renders per request: its scripts carry the response's CSP nonce, which the proxy
  // makes for each one (architecture 6.4). A prerendered page would have none.
  await connection();
  const locale = resolveCruisingLocale((await params).locale);
  setRequestLocale(locale);
  const brand = await requestBrand();

  return (
    <html lang={locale} className={await fontVariablesFor(brand)} data-brand={brand}>
      <body>
        {brand === 'neoqlick' ? <NeoqlickThemeLink /> : null}
        <ClientMessages>{children}</ClientMessages>
        <ErrorReporter />
      </body>
    </html>
  );
}
