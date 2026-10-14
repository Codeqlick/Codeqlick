import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { resetPasswordAction } from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'ResetPassword' });
  return pageMetadata({ locale, path: '/reset-password', title: t('metaTitle'), noindex: true });
}

/** Landing page of the link in the reset email. The token is only checked when the form is sent. */
export default async function ResetPasswordPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'ResetPassword' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const token = firstParam((await searchParams).token);

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          {token ? (
            <>
              <p className={styles.muted}>{t('subtitle')}</p>
              <ActionForm action={resetPasswordAction} className={styles.form}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="token" value={token} />
                <FormInput
                  name="newPassword"
                  type="password"
                  label={t('newPassword')}
                  hint={t('newPasswordHint')}
                  autoComplete="new-password"
                  required
                />
                <FormInput
                  name="confirmPassword"
                  type="password"
                  label={t('confirmPassword')}
                  autoComplete="new-password"
                  required
                />
                <SubmitButton block pendingLabel={t('submitting')}>
                  {t('submit')}
                </SubmitButton>
              </ActionForm>
            </>
          ) : (
            <Alert tone="error">{t('invalidLink')}</Alert>
          )}
          <p>
            <Link href="/forgot-password">{t('requestNew')}</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
