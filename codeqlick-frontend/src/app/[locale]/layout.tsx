import '@/styles/globals.css';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ErrorReporter } from '@/components/layout/ErrorReporter';
import { ClientMessages } from '@/i18n/ClientMessages';
import { resolveLocale } from '@/i18n/locale';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';
import { DEFAULT_OG_IMAGE, localeAlternates } from '@/lib/seo';
import { fontVariables } from '../fonts';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
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
      locale: locale === 'es' ? 'es_ES' : 'en_US',
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
    // ExoClick's ownership check for the video chat's ads (architecture 4.7).
    other: { '6a97888e-site-verification': '5e55aa28a6c9210038f92e69880e6449' },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
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
