import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import { forgotPasswordAction } from './actions';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'ForgotPassword' });
  return pageMetadata({ locale, path: '/forgot-password', title: t('metaTitle'), noindex: true });
}

export default async function ForgotPasswordPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'ForgotPassword' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.muted}>{t('subtitle')}</p>
          <ActionForm action={forgotPasswordAction} className={styles.form}>
            <input type="hidden" name="locale" value={locale} />
            <FormInput
              name="email"
              type="email"
              label={t('email')}
              autoComplete="username"
              required
            />
            <SubmitButton block pendingLabel={t('submitting')}>
              {t('submit')}
            </SubmitButton>
          </ActionForm>
        </Card>
        <Link href="/login" className={styles.back}>
          ← {t('backToLogin')}
        </Link>
      </div>
    </main>
  );
}
