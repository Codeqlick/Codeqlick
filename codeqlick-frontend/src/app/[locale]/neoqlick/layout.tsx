import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Analytics } from '@/components/layout/Analytics';
import { PortalFrame } from '@/components/neoqlick/PortalFrame';
import { resolveCruisingLocale } from '@/i18n/locale';
import { requestHostClass } from '@/lib/request-brand';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

// Adults only, like the apps: Google's label (architecture 4.18). Plus the ownership check of
// Neoqlick's own ExoClick site for neoqlick.com.
export const metadata: Metadata = {
  other: {
    rating: 'adult',
    '6a97888e-site-verification': 'f4c1803b4bcbb7d3aa7e48ad92bd5004',
  },
};

/**
 * Neoqlick's portal (architecture 4.18): `neoqlick.com`, which presents the three apps, the
 * company and the legal pages. The route exists only on that host; anywhere else it is a 404.
 */
export default async function PortalLayout({ children, params }: LayoutProps) {
  const locale = resolveCruisingLocale((await params).locale);
  setRequestLocale(locale);
  if ((await requestHostClass()).kind !== 'portal') notFound();

  return (
    <PortalFrame locale={locale}>
      {children}
      <Analytics />
    </PortalFrame>
  );
}
