import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { AppSwitcher } from '@/components/layout/AppSwitcher';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link, WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { logoutAction } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import { webappAlternates, webappOrigin, webappPath } from '@/lib/webapp-seo';
import vc from '../videochat/videochat.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  const image = { url: webappPath('swipe', locale, '/og'), width: 1200, height: 630, alt: title };
  return {
    // Relative URLs (canonical, images) resolve on Swipe's own host.
    metadataBase: new URL(webappOrigin('swipe')),
    title: { absolute: title, template: `%s · ${t('metaSuffix')}` },
    description,
    alternates: webappAlternates('swipe', locale),
    openGraph: {
      type: 'website',
      siteName: t('metaSuffix'),
      title,
      description,
      url: webappPath('swipe', locale),
      locale: locale === 'es' ? 'es_ES' : 'en_US',
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    // Indexed like every Codeqlick app (owner's choice, 2026-11-09); the account-only pages
    // (deck, photos, matches) opt out.
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    // Sexual content between adults: Google's label, so SafeSearch filters it as it must.
    other: {
      rating: 'adult',
      // Google Search Console's ownership check for swipe.codeqlick.com.
      'google-site-verification': '_A3wQZIogBMzJQNEVq_--g1xi9eYTwtYVMRBFwH5kZU',
    },
    // No `icons`: the site's Codeqlick favicons, like the video chat (Google shows them in
    // results). The installed app keeps its own icon through the manifest.
    appleWebApp: { capable: true, title: 'Swipe', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** Swipe's own frame (swipe.codeqlick.com): light colours and the Codeqlick logo, no site header. */
export default async function SwipeLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Swipe' });
  const user = await getCurrentUser();

  const webapp = (await requestWebapp()) === 'swipe' ? 'swipe' : null;

  return (
    <WebappProvider app={webapp}>
      <div className={vc.frame}>
        <header className={vc.header}>
          <div className={vc.brand}>
            <Logo href="/swipe" size="sm" label={t('homeLabel')} />
            <span className={vc.brandApp}>{t('brand')}</span>
            <span className={vc.adultBadge}>{t('adultBadge')}</span>
          </div>
          <nav className={vc.headerNav}>
            {user ? (
              <>
                <Link href="/swipe/deck" className={vc.headerLink}>
                  {t('nav.deck')}
                </Link>
                <Link href="/swipe/matches" className={vc.headerLink}>
                  {t('nav.matches')}
                </Link>
                <Link href="/swipe/photos" className={vc.headerLink}>
                  {t('nav.photos')}
                </Link>
              </>
            ) : null}
            <Link href="/swipe/rules" className={vc.headerLink}>
              {t('nav.rules')}
            </Link>
            <AppSwitcher current="swipe" locale={locale} />
            <LocaleSwitcher className={vc.locale} />
            {user ? (
              <form action={logoutAction}>
                <input type="hidden" name="locale" value={locale} />
                <SubmitButton variant="ghost" size="sm" className={vc.signOut}>
                  {t('signOut')}
                </SubmitButton>
              </form>
            ) : null}
          </nav>
        </header>
        <main className={vc.main}>{children}</main>
        <footer className={vc.main}>
          <p className={vc.muted}>
            <Link href="/swipe/takedown" className={vc.inlineLink}>
              {t('footerTakedown')}
            </Link>
            {' · '}
            <Link href="/swipe/rules" className={vc.inlineLink}>
              {t('nav.rules')}
            </Link>
            {' · '}
            <Link href="/swipe/terms-of-use" className={vc.inlineLink}>
              {t('legal.terms')}
            </Link>
            {' · '}
            <Link href="/swipe/privacy-policy" className={vc.inlineLink}>
              {t('legal.privacy')}
            </Link>
          </p>
        </footer>
      </div>
    </WebappProvider>
  );
}
