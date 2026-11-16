import { getTranslations } from 'next-intl/server';
import { DeleteSection, ExportSection } from '@/components/account/AccountSections';
import { PageHeader } from '@/components/app/PageHeader';
import styles from '@/components/app/app.module.css';
import { resolveCruisingLocale } from '@/i18n/locale';
import { ssoEnabled } from '@/lib/account-links';
import { requireUser } from '@/lib/auth/session';

/** Download my data and delete the account. */
export default async function AccountPrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveCruisingLocale((await params).locale);
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const exportHref = `/${locale}${ssoEnabled ? '' : '/account'}/export`;

  return (
    <div className={styles.stack}>
      <PageHeader title={t('nav.privacy')} lead={t('privacy.lead')} />
      <ExportSection locale={locale} href={exportHref} />
      <DeleteSection locale={locale} user={user} />
    </div>
  );
}
