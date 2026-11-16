import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { AppNavItem } from '@/components/layout/AppNav';
import { AppShell } from '@/components/layout/AppShell';
import { resolveCruisingLocale } from '@/i18n/locale';
import { CRUISING_LOCALES } from '@/i18n/routing';
import { accountPath } from '@/lib/account-links';
import { requireUser } from '@/lib/auth/session';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * The account site (account.codeqlick.com, architecture 6.4, decision 108): one account for every
 * app, in all six languages. The proxy has already asked for a session (PROTECTED_PATH).
 */
export default async function AccountLayout({ children, params }: LayoutProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const user = await requireUser(locale, `/${locale}/account`);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });

  const items: AppNavItem[] = [
    { href: accountPath(''), label: t('nav.overview'), exact: true },
    { href: accountPath('/profile'), label: t('nav.profile') },
    { href: accountPath('/security'), label: t('nav.security') },
    { href: accountPath('/privacy'), label: t('nav.privacy') },
    { href: accountPath('/notifications'), label: t('nav.notifications') },
    { href: accountPath('/apps'), label: t('nav.apps') },
  ];

  return (
    <AppShell
      locale={locale}
      user={user}
      areaLabel={t('title')}
      items={items}
      locales={CRUISING_LOCALES}
    >
      {children}
    </AppShell>
  );
}
