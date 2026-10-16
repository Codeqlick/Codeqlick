import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { confirmSignupAction } from '../actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Register' });
  return pageMetadata({
    locale,
    path: '/register/confirm',
    title: t('confirmTitle'),
    noindex: true,
  });
}

/**
 * The link of the confirmation email. It takes a click to spend the token, so a mail scanner that
 * opens links doesn't confirm the account for them.
 */
export default async function ConfirmSignupPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Register' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const token = firstParam((await searchParams).token);

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('confirmTitle')}</h1>
          {token ? (
            <>
              <p className={styles.muted}>{t('confirmBody')}</p>
              <ActionForm action={confirmSignupAction} className={styles.form}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="token" value={token} />
                <SubmitButton block pendingLabel={t('confirming')}>
                  {t('confirm')}
                </SubmitButton>
              </ActionForm>
            </>
          ) : (
            <Alert tone="error">{t('invalidLink')}</Alert>
          )}
          <p>
            <Link href="/register">{t('startAgain')}</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
