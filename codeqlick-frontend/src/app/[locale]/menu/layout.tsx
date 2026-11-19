import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { requestWebapp } from '@/lib/webapp-request';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Menu' });
  return {
    title: { absolute: `${t('metaTitle')} — Codeqlick` },
    description: t('metaDescription'),
    appleWebApp: { capable: true, title: 'Menu', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/**
 * Menu (menu.codeqlick.com): the messages for its Client Components and the short links on its
 * own host. The app's frame is in `(app)`; the public page, the poster and the report form
 * (`(bare)`) have none.
 */
export default async function MenuLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const webapp = (await requestWebapp()) === 'menu' ? 'menu' : null;

  return (
    <ClientMessages extra={APP_NAMESPACES.menu}>
      <WebappProvider app={webapp}>{children}</WebappProvider>
    </ClientMessages>
  );
}
