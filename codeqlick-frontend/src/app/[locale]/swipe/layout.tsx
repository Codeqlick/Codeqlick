import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppSwitcher } from '@/components/layout/AppSwitcher';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link, WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { logoutAction } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import vc from '../videochat/videochat.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe' });
  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    // Adult content: kept out of search results.
    robots: { index: false, follow: false },
    icons: { icon: '/swipe-192.png', apple: '/swipe-192.png' },
    appleWebApp: { capable: true, title: 'Swipe', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** Swipe's own frame (swipe.codeqlick.com): light colours, no studio header, logo or footer. */
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
            <Link href="/swipe" className={vc.headerLink} aria-label={t('homeLabel')}>
              <strong className={vc.brandApp}>{t('brand')}</strong>
            </Link>
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
