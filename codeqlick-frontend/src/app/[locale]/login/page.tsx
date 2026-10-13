import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCurrentUser, homeForRole } from '@/lib/auth/session';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { loginAction } from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Login' });
  return pageMetadata({ locale, path: '/login', title: t('metaTitle'), noindex: true });
}

export default async function LoginPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Login' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const user = await getCurrentUser();
  if (user) redirect(homeForRole(locale, user.role));

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.muted}>{t('subtitle')}</p>
          <ActionForm action={loginAction} className={styles.form}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={firstParam((await searchParams).next) ?? ''} />
            <FormInput
              name="email"
              type="email"
              label={t('email')}
              autoComplete="username"
              required
            />
            <FormInput
              name="password"
              type="password"
              label={t('password')}
              autoComplete="current-password"
              required
            />
            <SubmitButton block pendingLabel={t('submitting')}>
              {t('submit')}
            </SubmitButton>
          </ActionForm>
        </Card>
        <Link href="/" className={styles.back}>
          ← {t('backToSite')}
        </Link>
      </div>
    </main>
  );
}
