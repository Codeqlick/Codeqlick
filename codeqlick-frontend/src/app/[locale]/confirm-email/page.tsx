import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { confirmEmailAction } from '@/lib/auth/account-actions';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'ConfirmEmail' });
  return pageMetadata({ locale, path: '/confirm-email', title: t('title'), noindex: true });
}

/**
 * Landing page of the link that confirms a new account email. The change happens on the button,
 * not on opening the page: mail scanners that open links must not spend the token.
 */
export default async function ConfirmEmailPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'ConfirmEmail' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const token = firstParam((await searchParams).token);

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          {token ? (
            <ActionForm action={confirmEmailAction} className={styles.form}>
              <p className={styles.muted}>{t('body')}</p>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="token" value={token} />
              <SubmitButton block pendingLabel={t('confirming')}>
                {t('confirm')}
              </SubmitButton>
            </ActionForm>
          ) : (
            <Alert tone="error">{t('invalidLink')}</Alert>
          )}
        </Card>
      </div>
    </main>
  );
}
