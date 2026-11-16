import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { AppHeader } from '@/components/layout/AppHeader';
import { meetingsMenu } from '@/lib/app-menus';
import { WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import styles from './meetings.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meetings' });
  return {
    title: { absolute: `${t('metaTitle')} — Codeqlick` },
    description: t('metaDescription'),
    appleWebApp: { capable: true, title: 'Meetings', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** The meetings' own frame (meetings.codeqlick.com): Codeqlick's light colours, no site header. */
export default async function MeetingsLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const user = await getCurrentUser();

  const webapp = (await requestWebapp()) === 'meetings' ? 'meetings' : null;

  return (
    <ClientMessages extra={APP_NAMESPACES.meetings}>
      <WebappProvider app={webapp}>
        <div className={styles.frame}>
          <AppHeader
            app="meetings"
            locale={locale}
            config={meetingsMenu()}
            signedIn={Boolean(user)}
          />
          <main className={styles.main}>{children}</main>
        </div>
      </WebappProvider>
    </ClientMessages>
  );
}
