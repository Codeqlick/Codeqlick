import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { Logo } from '@/components/brand/Logo';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { resolveCruisingLocale } from '@/i18n/locale';
import { contactLinkKind } from '@/lib/cruising-safety';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { SafetyContactForm, type SafetyContactCopy } from './SafetyContactForm';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SafetyContact' });
  return pageMetadata({ locale, path: '/safety-contact', title: t('metaTitle'), noindex: true });
}

/**
 * Landing page of Neoqlick safety alerts' links (architecture 4.15, decision 95): someone named
 * as a trusted contact accepts or refuses, or stops the alerts. No session: the token is the
 * proof. It speaks of "Neoqlick safety alerts" only, like the emails.
 */
export default async function SafetyContactPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SafetyContact' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const token = firstParam((await searchParams).token)?.trim() ?? '';
  const kind = contactLinkKind(token);
  const copy: SafetyContactCopy = {
    inviteLead: t('inviteLead'),
    stopLead: t('stopLead'),
    accept: t('accept'),
    refuse: t('refuse'),
    stop: t('stop'),
    working: t('working'),
    accepted: t('accepted'),
    refused: t('refused'),
    stopped: t('stopped'),
    invalidLink: t('invalidLink'),
    retry: t('retry'),
  };

  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <Logo href="/" label={tc('homeLabel')} />
        <Card bordered>
          <h1 className={styles.title}>{t('title')}</h1>
          {kind ? (
            <SafetyContactForm token={token} kind={kind} copy={copy} />
          ) : (
            <Alert tone="error">{t('invalidLink')}</Alert>
          )}
        </Card>
      </div>
    </main>
  );
}
