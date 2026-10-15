import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { AppNavItem } from '@/components/layout/AppNav';
import { AppShell } from '@/components/layout/AppShell';
import { resolveLocale } from '@/i18n/locale';
import { requireRole } from '@/lib/auth/session';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Portal' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function PortalLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  const user = await requireRole(locale, ['CLIENT', 'ADMIN'], `/${locale}/portal`);
  const t = await getTranslations({ locale, namespace: 'Portal' });
  const ta = await getTranslations({ locale, namespace: 'Admin' });
  const tc = await getTranslations({ locale, namespace: 'Account' });

  const items: AppNavItem[] = [
    // Exact: /portal/account must not highlight it too.
    { href: '/portal', label: t('nav.projects'), exact: true },
    { href: '/portal/support', label: t('nav.support') },
    { href: '/portal/account', label: tc('nav') },
  ];
  if (user.role === 'ADMIN') items.push({ href: '/admin', label: ta('title') });

  return (
    <AppShell locale={locale} user={user} areaLabel={t('title')} items={items}>
      {children}
    </AppShell>
  );
}
