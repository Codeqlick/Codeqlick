import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFrame } from '@/components/layout/AppFrame';
import { AppFooter } from '@/components/layout/AppFooter';
import { cloudMenu } from '@/lib/app-menus';
import { cloudDocsUrl } from '@/lib/cloud-docs-url';
import { WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import { webappAlternates, webappOrigin, webappPath } from '@/lib/webapp-seo';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    // Relative URLs (canonical) resolve on Cloud's own host.
    metadataBase: new URL(webappOrigin('cloud')),
    title: { absolute: title, template: '%s · Codeqlick Cloud' },
    description,
    alternates: webappAlternates('cloud', locale),
    openGraph: {
      type: 'website',
      siteName: 'Codeqlick Cloud',
      title,
      description,
      url: webappPath('cloud', locale),
      locale: locale === 'es' ? 'es_ES' : 'en_US',
    },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** Codeqlick Cloud's own frame (cloud.codeqlick.com, architecture 4.13): light colours, no site header. */
export default async function CloudLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const docsHref = cloudDocsUrl(locale);
  const webapp = (await requestWebapp()) === 'cloud' ? 'cloud' : null;

  return (
    <ClientMessages extra={APP_NAMESPACES.cloud}>
      <WebappProvider app={webapp}>
        <AppFrame
          header={
            <AppHeader
              app="cloud"
              locale={locale}
              config={cloudMenu(locale, { signedIn: Boolean(user) }, docsHref)}
              user={user}
            />
          }
          footer={<AppFooter app="cloud" locale={locale} docsHref={docsHref} />}
        >
          {children}
        </AppFrame>
      </WebappProvider>
    </ClientMessages>
  );
}
