import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { resolveCruisingLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import { safeReturnPath } from '@/lib/sso';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  return { title: t('failed.title'), robots: { index: false, follow: false } };
}

/** Single sign-on didn't finish (decision 108): an expired or reused code, another tab… */
export default async function SignInFailedPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const next = safeReturnPath(firstParam((await searchParams).next), locale);
  const retry = `/${locale}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('failed.title')}</h1>
          <p className={styles.muted}>{t('failed.body')}</p>
          <p>
            {/* A plain link: the proxy starts a new sign-in from it. */}
            <a className={buttonClassName({ block: true })} href={retry}>
              {t('failed.retry')}
            </a>
          </p>
        </Card>
      </div>
    </main>
  );
}
