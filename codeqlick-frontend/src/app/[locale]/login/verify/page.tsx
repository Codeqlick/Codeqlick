import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { TWO_FACTOR_COOKIE } from '@/lib/auth/constants';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { verifyTwoFactorAction } from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'TwoFactorLogin' });
  return pageMetadata({ locale, path: '/login/verify', title: t('title'), noindex: true });
}

/** Asks for the authenticator code after a correct password. */
export default async function VerifyTwoFactorPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'TwoFactorLogin' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const next = firstParam((await searchParams).next) ?? '';

  // Without the challenge from the password step there is nothing to verify.
  if (!(await cookies()).get(TWO_FACTOR_COOKIE)) redirect(`/${locale}/login`);

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.muted}>{t('subtitle')}</p>
          <ActionForm action={verifyTwoFactorAction} className={styles.form}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={next} />
            <FormInput
              name="code"
              label={t('code')}
              hint={t('codeHint')}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              mono
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
