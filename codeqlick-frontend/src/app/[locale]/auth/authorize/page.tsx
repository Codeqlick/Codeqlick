import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { resolveCruisingLocale } from '@/i18n/locale';
import { isAccountHost } from '@/lib/account-host';
import { createSsoCode } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import { getCurrentUser } from '@/lib/auth/session';
import { callbackUrl, parseAuthorizeQuery } from '@/lib/sso';
import { WEBAPPS } from '@/lib/webapps';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Single sign-on's authorize step, `/{locale}/authorize` on the account host (architecture 4.3,
 * decision 108): signs the person in here if needed, then hands the client host a one-time code
 * at its fixed callback, built from the client's name and this host, never read from the request.
 * A page rather than a route handler: a sign-in's Server Action redirects here, and Next.js
 * renders a page once, as the action's answer, where it would call a route handler on its own.
 */
export default async function AuthorizePage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const incoming = await headers();
  const host = incoming.get('x-forwarded-host')?.split(',')[0]?.trim() || incoming.get('host');
  if (!isAccountHost(host) || !host) notFound();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }
  const authorize = parseAuthorizeQuery(query, host);
  if (!authorize) {
    const t = await getTranslations({ locale, namespace: 'AccountSite' });
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return (
      <main className={styles.login}>
        <div className={styles.loginCard}>
          <Logo href="/" label={tc('homeLabel')} />
          <Card bordered>
            <h1 className={styles.title}>{t('failed.title')}</h1>
            <Alert tone="error">{t('failed.invalid')}</Alert>
          </Card>
        </div>
      </main>
    );
  }

  // Back here after signing in: this very address, as a path of the account host.
  const self = `/${locale}/authorize?${query.toString()}`;
  const signIn = (): never => {
    if (!authorize.register) redirect(`/${locale}/login?next=${encodeURIComponent(self)}`);
    const app = WEBAPPS.find((name) => name === authorize.client);
    redirect(`/${locale}/register?next=${encodeURIComponent(self)}${app ? `&app=${app}` : ''}`);
  };

  if (!(await getCurrentUser())) signIn();

  let code = '';
  try {
    ({ code } = await createSsoCode({
      client: authorize.client,
      codeChallenge: authorize.codeChallenge,
    }));
  } catch (error) {
    // The account session ended (signed out elsewhere): sign in again.
    if (isApiError(error) && error.status === 401) signIn();
    throw error;
  }

  const protocol = incoming.get('x-forwarded-proto') === 'https' ? 'https:' : 'http:';
  const target = new URL(callbackUrl(authorize.client, host, protocol, locale));
  target.searchParams.set('code', code);
  target.searchParams.set('state', authorize.state);
  redirect(target.toString());
}
