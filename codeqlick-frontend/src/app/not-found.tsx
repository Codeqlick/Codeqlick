import '@/styles/globals.css';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppNotFound, isNotFoundApp } from '@/components/layout/AppNotFound';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ClientMessages } from '@/i18n/ClientMessages';
import { cruisingLocaleOrDefault, localeOrDefault } from '@/i18n/locale';
import { NeoqlickThemeLink } from '@/components/neoqlick/NeoqlickThemeLink';
import { NeoqlickNotFound } from '@/components/neoqlick/NeoqlickNotFound';
import { requestBrand, requestHostClass } from '@/lib/request-brand';
import { requestWebapp } from '@/lib/webapp-request';
import { NotFoundContent } from './[locale]/(site)/NotFoundContent';
import { fontVariablesFor } from './fonts';

// Every URL that matches no route, rendered on the server. The root layout is a passthrough, so
// this renders the whole document; the locale comes from the proxy (next-intl), or the default for
// paths it skips (e.g. unknown files).
export default async function RootNotFound() {
  const brand = await requestBrand();
  // Neoqlick's hosts speak six languages (the portal, the account host and Cruising).
  const locale =
    brand === 'neoqlick'
      ? cruisingLocaleOrDefault(await getLocale())
      : localeOrDefault(await getLocale());
  const t = await getTranslations({ locale, namespace: 'Common' });
  // On the host of Cloud, Citas or Meetings the 404 keeps the app's frame (architecture 6.6).
  const app = await requestWebapp();

  return (
    <html lang={locale} className={await fontVariablesFor(brand)} data-brand={brand}>
      <head>
        <link
          rel="icon"
          href={brand === 'neoqlick' ? '/neoqlick/favicon.ico' : '/favicon.ico'}
          sizes="any"
        />
        <link
          rel="icon"
          href={brand === 'neoqlick' ? '/neoqlick/svg/favicon.svg' : '/favicon.svg'}
          type="image/svg+xml"
        />
      </head>
      <body>
        {brand === 'neoqlick' ? <NeoqlickThemeLink /> : null}
        {brand === 'neoqlick' ? (
          <ClientMessages locale={locale}>
            <NeoqlickNotFound
              locale={locale}
              account={(await requestHostClass()).kind !== 'account'}
            />
          </ClientMessages>
        ) : isNotFoundApp(app) ? (
          <AppNotFound app={app} locale={locale} />
        ) : (
          <ClientMessages locale={locale}>
            <a className="skip-link" href="#main">
              {t('skipToContent')}
            </a>
            <SiteHeader locale={locale} />
            <main id="main">
              <NotFoundContent locale={locale} />
            </main>
            <SiteFooter locale={locale} />
          </ClientMessages>
        )}
      </body>
    </html>
  );
}
