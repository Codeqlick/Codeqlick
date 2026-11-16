import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMe, type CloudMe } from '@/lib/api/cloud';
import { acceptTermsAction } from '../actions';
import styles from '../cloud.module.css';

/** The console is the account's own: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

/**
 * Every console page first asks for the current Cloud terms when any of my teams has older ones
 * (architecture 4.13 Terms, decision 105). API tokens and the CLI are never blocked by this.
 */
export default async function ConsoleLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  let me: CloudMe | null = null;
  try {
    me = await getCloudMe();
  } catch {
    // The pages themselves deal with a missing session or a failing API.
  }
  if (!me || me.termsAccepted !== false) return children;
  const t = await getTranslations({ locale, namespace: 'Cloud.termsGate' });
  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <div>
        <h1 className={styles.heroTitle}>{t('title')}</h1>
        <p className={styles.muted}>{t('lead')}</p>
      </div>
      <div className={styles.card}>
        <p>
          <Link href="/cloud/terms-of-use" target="_blank">
            {t('read')}
          </Link>
        </p>
        <ActionForm
          action={acceptTermsAction.bind(null, locale, me.termsVersion)}
          className={styles.form}
        >
          <FormCheckbox name="accept" label={t('accept')} />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('accepting')}>{t('submit')}</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
