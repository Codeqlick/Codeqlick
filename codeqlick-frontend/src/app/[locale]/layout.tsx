import '@/styles/globals.css';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ErrorReporter } from '@/components/layout/ErrorReporter';
import { ClientMessages } from '@/i18n/ClientMessages';
import { resolveLocale } from '@/i18n/locale';
import { OG_LOCALES, SITE_LOCALES } from '@/i18n/routing';
import { env } from '@/lib/env';
import { DEFAULT_OG_IMAGE, localeAlternates } from '@/lib/seo';
import { fontVariables } from '../fonts';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

/** Built ahead in both languages. */
export function generateStaticParams() {
  return SITE_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    metadataBase: new URL(env.SITE_URL),
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
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: { card: 'summary_large_image' },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: '/apple-touch-icon.png',
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  // Every page renders per request: its scripts carry the response's CSP nonce, which the proxy
  // makes for each one (architecture 6.4). A prerendered page would have none.
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <ClientMessages>{children}</ClientMessages>
        <ErrorReporter />
      </body>
    </html>
  );
}
