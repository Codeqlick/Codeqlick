import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { signupInvitation } from '@/lib/api/auth';
import { getCurrentUser, homeForRole } from '@/lib/auth/session';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { registerAction } from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    email?: string | string[];
    invitation?: string | string[];
    sent?: string | string[];
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Register' });
  return pageMetadata({ locale, path: '/register', title: t('metaTitle'), noindex: true });
}

/**
 * Clients create their own account here (decision 17). `?email=` fills the email in, `?invitation=`
 * is the team's invitation (its email fixed, signed in at once), `?sent=` says the confirmation
 * email is on its way.
 */
export default async function RegisterPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Register' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const user = await getCurrentUser();
  if (user) redirect(homeForRole(locale, user.role));
  const query = await searchParams;
  const sent = firstParam(query.sent);
  const token = firstParam(query.invitation);
  const invited = token ? await signupInvitation(token).catch(() => null) : null;

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          {sent ? (
            <>
              <h1 className={styles.title}>{t('sentTitle')}</h1>
              <p className={styles.muted}>{t('sentBody', { email: sent })}</p>
            </>
          ) : (
            <>
              <h1 className={styles.title}>{t('title')}</h1>
              <p className={styles.muted}>{invited ? t('invitedSubtitle') : t('subtitle')}</p>
              {token && !invited ? <Alert tone="error">{t('invitationExpired')}</Alert> : null}
              <ActionForm action={registerAction} className={styles.form}>
                <input type="hidden" name="locale" value={locale} />
                {invited ? <input type="hidden" name="invitation" value={token} /> : null}
                <FormInput
                  name="name"
                  label={t('name')}
                  autoComplete="name"
                  defaultValue={invited?.name}
                  required
                />
                {invited ? (
                  <>
                    <input type="hidden" name="email" value={invited.email} />
                    <FormInput
                      name="emailShown"
                      type="email"
                      label={t('email')}
                      hint={t('invitedEmailHint')}
                      defaultValue={invited.email}
                      readOnly
                    />
                  </>
                ) : (
                  <FormInput
                    name="email"
                    type="email"
                    label={t('email')}
                    autoComplete="username"
                    defaultValue={firstParam(query.email)}
                    required
                  />
                )}
                <FormInput
                  name="password"
                  type="password"
                  label={t('password')}
                  hint={t('passwordHint')}
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
                <FormCheckbox
                  name="acceptPrivacy"
                  label={t.rich('acceptPrivacy', {
                    link: (chunks) => (
                      <Link href="/privacy" target="_blank">
                        {chunks}
                      </Link>
                    ),
                  })}
                  required
                />
                {/* Honeypot: hidden from people and assistive tech, tempting for bots. */}
                <div className="visually-hidden" aria-hidden="true">
                  <label htmlFor="register-website">Website</label>
                  <input
                    id="register-website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
                <SubmitButton block pendingLabel={t('submitting')}>
                  {t('submit')}
                </SubmitButton>
              </ActionForm>
            </>
          )}
          <p>
            {t('haveAccount')} <Link href="/login">{t('signIn')}</Link>
          </p>
        </Card>
        <Link href="/" className={styles.back}>
          ← {t('backToSite')}
        </Link>
      </div>
    </main>
  );
}
