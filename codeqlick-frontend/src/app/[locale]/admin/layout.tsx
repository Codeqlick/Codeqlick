import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AccountPage } from '@/components/app/AccountPage';
import { AdminSearch } from '@/components/app/AdminSearch';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { getTwoFactorStatus } from '@/lib/api/auth';
import type { AdminSearchKind } from '@/lib/api/types';
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
    { href: '/admin/newsletter', label: t('nav.newsletter') },
    { href: '/admin/tags', label: t('nav.tags') },
    { href: '/admin/portfolio', label: t('nav.portfolio') },
    { href: '/admin/media', label: t('nav.media') },
    { href: '/admin/projects', label: t('nav.projects') },
    { href: '/admin/sites', label: t('nav.sites') },
    { href: '/admin/previews', label: t('nav.previews') },
    { href: '/admin/time', label: t('nav.time') },
    { href: '/admin/monitoring', label: t('nav.monitoring') },
    { href: '/admin/errors', label: t('nav.errors') },
    { href: '/admin/users', label: t('nav.users') },
    { href: '/admin/videochat', label: t('nav.videochat') },
    { href: '/admin/swipe', label: t('nav.swipe') },
    { href: '/admin/cloud', label: t('nav.cloud') },
    { href: '/admin/replies', label: t('nav.replies') },
    { href: '/admin/calculator', label: t('nav.calculator') },
    { href: '/admin/activity', label: t('nav.activity') },
    { href: '/admin/account', label: ta('nav') },
  ];

  // Each kind's heading in the search is its admin menu entry's name.
  const searchGroups: Record<AdminSearchKind, string> = {
    lead: t('nav.leads'),
    user: t('nav.users'),
    project: t('nav.projects'),
    ticket: t('nav.support'),
    proposal: t('nav.proposals'),
    post: t('nav.posts'),
    caseStudy: t('nav.portfolio'),
  };
  const search = (
    <AdminSearch
      locale={locale}
      labels={{
        button: t('search.button'),
        shortcut: t('search.shortcut'),
        shortcutApple: t('search.shortcutApple'),
        title: t('search.title'),
        inputLabel: t('search.inputLabel'),
        placeholder: t('search.placeholder'),
        close: t('search.close'),
        results: t('search.results'),
        hint: t('search.hint'),
        searching: t('search.searching'),
        empty: t('search.empty', { q: '{q}' }),
        resultsOne: t('search.resultsOne'),
        resultsMany: t('search.resultsMany', { count: '{count}' }),
        tooMany: t('search.tooMany'),
        failed: t('search.failed'),
        expired: t('search.expired'),
        groups: searchGroups,
      }}
    />
  );

  return (
    <AppShell locale={locale} user={user} areaLabel={t('title')} items={items} search={search}>
      {children}
    </AppShell>
  );
}
