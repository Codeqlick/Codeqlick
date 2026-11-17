import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NEOQLICK_EXOCLICK_VERIFICATION } from '@/lib/neoqlick-exoclick';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFrame } from '@/components/layout/AppFrame';
import { AppFooter } from '@/components/layout/AppFooter';
import { videochatMenu } from '@/lib/app-menus';
import { WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getVideochatStatus } from '@/lib/api/videochat';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import { BRANDS } from '@/lib/brand';
import { requestBrand } from '@/lib/request-brand';
import { webappAlternates, webappOrigin, webappPath } from '@/lib/webapp-seo';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Videochat' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  const image = {
    url: webappPath('videochat', locale, '/og'),
    width: 1200,
    height: 630,
    alt: title,
  };
  const old = (await requestBrand()) === 'codeqlick';
  return {
    // Relative URLs (canonical, images) resolve on the video chat's own host.
    metadataBase: new URL(webappOrigin('videochat')),
    title: { absolute: title, template: `%s · ${t('metaSuffix')}` },
    description,
    alternates: webappAlternates('videochat', locale),
    openGraph: {
      type: 'website',
      siteName: t('metaSuffix'),
      title,
      description,
      url: webappPath('videochat', locale),
      locale: locale === 'es' ? 'es_ES' : 'en_US',
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    // Public pages are indexed; the account-only ones (room, contacts, settings) opt out.
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    other: {
      // Sexual content between adults: Google's label, so SafeSearch filters it as it must.
      rating: 'adult',
      // The old host's ExoClick and Search Console checks (`other` replaces the root layout's);
      // on Neoqlick's host, Neoqlick's own ExoClick check (architecture 4.18).
      ...(old
        ? {
            '6a97888e-site-verification': '5e55aa28a6c9210038f92e69880e6449',
            'google-site-verification': '_A3wQZIogBMzJQNEVq_--g1xi9eYTwtYVMRBFwH5kZU',
          }
        : NEOQLICK_EXOCLICK_VERIFICATION),
    },
    icons: BRANDS.neoqlick.icons,
    // Installed on a phone it opens as its own app (manifest: app/manifest.ts on this host).
    appleWebApp: { capable: true, title: 'Videochat', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** The video chat's own frame (videochat.neoqlick.com): Neoqlick's light colours, no site header or footer. */
export default async function VideochatLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const user = await getCurrentUser();
  // The menu's user card: the profile once entered (with a profile), and the verified badge.
  let entered = false;
  let verified = false;
  if (user) {
    try {
      const status = await getVideochatStatus();
      entered = status.allowed && status.profile !== null;
      verified = status.verification.status === 'APPROVED';
    } catch {
      // The frame still works when the video chat's state can't be read.
    }
  }

  const webapp = (await requestWebapp()) === 'videochat' ? 'videochat' : null;

  return (
    <ClientMessages extra={APP_NAMESPACES.videochat}>
      <WebappProvider app={webapp}>
        <AppFrame
          header={
            <AppHeader
              app="videochat"
              locale={locale}
              config={videochatMenu(locale, { signedIn: Boolean(user), entered })}
              user={user}
              verified={verified}
              adult
            />
          }
          footer={<AppFooter app="videochat" locale={locale} />}
        >
          {children}
        </AppFrame>
      </WebappProvider>
    </ClientMessages>
  );
}
