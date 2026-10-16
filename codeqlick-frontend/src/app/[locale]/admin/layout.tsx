import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AccountPage } from '@/components/app/AccountPage';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { getTwoFactorStatus } from '@/lib/api/auth';
import { resolveLocale } from '@/i18n/locale';
import { requireRole } from '@/lib/auth/session';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  const user = await requireRole(locale, ['ADMIN'], `/${locale}/admin`);
  const t = await getTranslations({ locale, namespace: 'Admin' });
  const ta = await getTranslations({ locale, namespace: 'Account' });
  const tf = await getTranslations({ locale, namespace: 'TwoFactor' });
  const twoFactor = await getTwoFactorStatus();

  // The API refuses admin calls until two-step verification is on: only the account page,
  // with the setup, is shown until then (whatever admin URL was opened).
  if (twoFactor.required && !twoFactor.enabled) {
    return (
      <AppShell
        locale={locale}
        user={user}
        areaLabel={t('title')}
        items={[{ href: '/admin/account', label: ta('nav') }]}
      >
        <Alert tone="info">{tf('requiredNotice')}</Alert>
        <AccountPage locale={locale} />
      </AppShell>
    );
  }

  const items = [
    { href: '/admin', label: t('nav.dashboard'), exact: true },
    { href: '/admin/leads', label: t('nav.leads') },
    { href: '/admin/bookings', label: t('nav.bookings') },
    { href: '/admin/proposals', label: t('nav.proposals') },
    { href: '/admin/support', label: t('nav.support') },
    { href: '/admin/posts', label: t('nav.posts') },
    { href: '/admin/tags', label: t('nav.tags') },
    { href: '/admin/portfolio', label: t('nav.portfolio') },
    { href: '/admin/media', label: t('nav.media') },
    { href: '/admin/projects', label: t('nav.projects') },
    { href: '/admin/time', label: t('nav.time') },
    { href: '/admin/monitoring', label: t('nav.monitoring') },
    { href: '/admin/users', label: t('nav.users') },
    { href: '/admin/replies', label: t('nav.replies') },
    { href: '/admin/calculator', label: t('nav.calculator') },
    { href: '/admin/activity', label: t('nav.activity') },
    { href: '/admin/account', label: ta('nav') },
  ];

  return (
    <AppShell locale={locale} user={user} areaLabel={t('title')} items={items}>
      {children}
    </AppShell>
  );
}
