import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { AppHeader } from '@/components/layout/AppHeader';
import { citasMenu } from '@/lib/app-menus';
import { WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import styles from './citas.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Citas' });
  return {
    title: { absolute: `${t('metaTitle')} — Codeqlick` },
    description: t('metaDescription'),
    appleWebApp: { capable: true, title: 'Citas', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** Citas's own frame (citas.codeqlick.com): Codeqlick's light colours, no site header. */
export default async function CitasLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const user = await getCurrentUser();

  const webapp = (await requestWebapp()) === 'citas' ? 'citas' : null;

  return (
    <ClientMessages extra={APP_NAMESPACES.citas}>
      <WebappProvider app={webapp}>
        <div className={styles.frame}>
          <AppHeader app="citas" locale={locale} config={citasMenu()} user={user} />
          <main className={styles.main}>{children}</main>
        </div>
      </WebappProvider>
    </ClientMessages>
  );
}
