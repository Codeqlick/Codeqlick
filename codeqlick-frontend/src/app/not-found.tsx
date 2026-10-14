import '@/styles/globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { localeOrDefault } from '@/i18n/locale';
import { NotFoundContent } from './[locale]/(site)/NotFoundContent';
import { fontVariables } from './fonts';

// Every URL that matches no route, rendered on the server. The root layout is a passthrough, so
// this renders the whole document; the locale comes from the proxy (next-intl), or the default for
// paths it skips (e.g. unknown files).
export default async function RootNotFound() {
  const locale = localeOrDefault(await getLocale());
  const t = await getTranslations({ locale, namespace: 'Common' });

  return (
    <html lang={locale} className={fontVariables}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale}>
          <a className="skip-link" href="#main">
            {t('skipToContent')}
          </a>
          <SiteHeader locale={locale} />
          <main id="main">
            <NotFoundContent locale={locale} />
          </main>
          <SiteFooter locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
