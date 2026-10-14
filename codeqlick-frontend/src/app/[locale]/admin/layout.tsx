import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
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

  const items = [
    { href: '/admin', label: t('nav.dashboard'), exact: true },
    { href: '/admin/leads', label: t('nav.leads') },
    { href: '/admin/posts', label: t('nav.posts') },
    { href: '/admin/portfolio', label: t('nav.portfolio') },
    { href: '/admin/media', label: t('nav.media') },
    { href: '/admin/projects', label: t('nav.projects') },
    { href: '/admin/users', label: t('nav.users') },
    { href: '/admin/activity', label: t('nav.activity') },
    { href: '/admin/account', label: ta('nav') },
  ];

  return (
    <AppShell locale={locale} user={user} areaLabel={t('title')} items={items}>
      {children}
    </AppShell>
  );
}
