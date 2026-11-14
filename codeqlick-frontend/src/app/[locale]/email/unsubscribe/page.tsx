import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { resolveLocale } from '@/i18n/locale';
import { getEmailPreferences } from '@/lib/api/email-preferences';
import { isApiError } from '@/lib/api/errors';
import {
  preferencesProblem,
  type EmailPreferences,
  type PreferencesProblem,
} from '@/lib/email-preferences';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { InvalidLink } from './InvalidLink';
import { UnsubscribeForm, type UnsubscribeCopy } from './UnsubscribeForm';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Unsubscribe' });
  return pageMetadata({ locale, path: '/email/unsubscribe', title: t('metaTitle'), noindex: true });
}

/**
 * Landing page of the unsubscribe link in the footer of an optional email (architecture 4.3 and
 * decision 50). No session: the token is the proof. Opening it changes nothing (mail scanners open
 * links); the button does.
 */
export default async function UnsubscribePage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Unsubscribe' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const token = firstParam((await searchParams).token)?.trim() ?? '';
  const accountPath = `/${locale}/portal/account`;

  let preferences: EmailPreferences | null = null;
  let problem: PreferencesProblem | null = token ? null : 'invalidLink';
  if (token) {
    try {
      preferences = await getEmailPreferences(token);
    } catch (error) {
      problem = preferencesProblem(isApiError(error) ? error.status : 0);
    }
  }

  let content: ReactNode;
  if (preferences) {
    const values = { kind: preferences.kind, email: preferences.email };
    const copy: UnsubscribeCopy = {
      subscribed: t('subscribed', values),
      unsubscribed: t('unsubscribed', values),
      alreadyUnsubscribed: t('alreadyUnsubscribed', values),
      resubscribed: t('resubscribed', values),
      unsubscribe: t('unsubscribe'),
      unsubscribing: t('unsubscribing'),
      undo: t('undo'),
      subscribeAgain: t('subscribeAgain'),
      subscribing: t('subscribing'),
      account: t('account'),
      invalidLink: t('invalidLink'),
      signIn: t('signIn'),
      retry: t('retry'),
    };
    content = (
      <UnsubscribeForm
        token={token}
        initial={{ subscribed: preferences.subscribed, changed: false }}
        copy={copy}
        accountPath={accountPath}
      />
    );
  } else if (problem === 'invalidLink') {
    content = <InvalidLink message={t('invalidLink')} signIn={t('signIn')} next={accountPath} />;
  } else {
    content = <Alert tone="error">{t('loadFailed')}</Alert>;
  }

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          {content}
        </Card>
      </div>
    </main>
  );
}
