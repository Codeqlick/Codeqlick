import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import { PasskeySignIn } from '@/components/app/PasskeySignIn';
import { Turnstile } from '@/components/app/Turnstile';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCurrentUser, safeNextPath } from '@/lib/auth/session';
import { homeAfterSignIn, onAccountHost, shortNext } from '@/lib/webapp-request';
import { siteLocale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { requestBrand } from '@/lib/request-brand';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { loginAction, passkeyLoginAction, passkeyLoginOptionsAction } from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    next?: string | string[];
    reset?: string | string[];
    welcome?: string | string[];
    emailChanged?: string | string[];
    email?: string | string[];
    accountDeleted?: string | string[];
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Login' });
  return pageMetadata({
    locale,
    path: '/login',
    title: t('metaTitle'),
    description: t('metaDescription'),
    noindex: true,
  });
}

export default async function LoginPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Login' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const user = await getCurrentUser();
  const query = await searchParams;
  const accountHost = await onAccountHost();
  const neoqlick = (await requestBrand()) === 'neoqlick';
  if (user) {
    redirect(
      (await shortNext(safeNextPath(firstParam(query.next), locale), locale)) ??
        (await homeAfterSignIn(locale, user.role)),
    );
  }

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.muted}>{t('subtitle')}</p>
          {query.reset ? <Alert tone="success">{t('passwordReset')}</Alert> : null}
          {query.welcome ? <Alert tone="success">{t('passwordCreated')}</Alert> : null}
          {query.emailChanged ? (
            <Alert tone="success">
              {t('emailChanged', { email: firstParam(query.email) ?? '' })}
            </Alert>
          ) : null}
          {query.accountDeleted ? <Alert tone="success">{t('accountDeleted')}</Alert> : null}
          <ActionForm action={loginAction} className={styles.form}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={firstParam(query.next) ?? ''} />
            <FormInput
              name="email"
              type="email"
              label={t('email')}
              autoComplete="username webauthn"
              required
            />
            <FormInput
              name="password"
              type="password"
              label={t('password')}
              autoComplete="current-password"
              required
            />
            {env.TURNSTILE_SITE_KEY ? (
              <Turnstile siteKey={env.TURNSTILE_SITE_KEY} locale={locale} />
            ) : null}
            <SubmitButton block pendingLabel={t('submitting')}>
              {t('submit')}
            </SubmitButton>
          </ActionForm>
          <PasskeySignIn
            getOptions={passkeyLoginOptionsAction}
            signIn={passkeyLoginAction.bind(null, locale, firstParam(query.next) ?? '')}
            labels={{
              or: t('passkeyOr'),
              button: t('passkey'),
              pending: t('passkeyPending'),
              failed: t('passkeyFailed'),
            }}
          />
          <p>
            <Link href="/forgot-password">{t('forgot')}</Link>
          </p>
          <p>
            {t('noAccount')}{' '}
            <Link
              href={
                query.next
                  ? `/register?next=${encodeURIComponent(firstParam(query.next) ?? '')}`
                  : '/register'
              }
            >
              {t('register')}
            </Link>
          </p>
        </Card>
        {/* On the account host, "back" is the website (its own home needs a session). */}
        {accountHost ? (
          <a
            href={`${neoqlick ? (env.NEOQLICK_URL ?? env.SITE_URL) : env.SITE_URL}/${neoqlick ? locale : siteLocale(locale)}`}
            className={styles.back}
          >
            ← {t('backToSite')}
          </a>
        ) : (
          <Link href="/" className={styles.back}>
            ← {t('backToSite')}
          </Link>
        )}
      </div>
    </main>
  );
}
