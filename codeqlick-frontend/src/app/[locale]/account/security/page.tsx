import { getTranslations } from 'next-intl/server';
import {
  EmailSection,
  PasswordSection,
  TwoFactorSection,
} from '@/components/account/AccountSections';
import { ActiveSessions } from '@/components/app/ActiveSessions';
import { PageHeader } from '@/components/app/PageHeader';
import { PasskeysPanel } from '@/components/app/PasskeysPanel';
import styles from '@/components/app/app.module.css';
import { resolveLocale } from '@/i18n/locale';
import { accountActivity } from '@/lib/api/auth';
import { requireUser } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/format';

/** The account activity's actions the page names; others show as "Account change". */
const KNOWN_ACTIONS = [
  'account.registered',
  'account.password_changed',
  'account.email_changed',
  'account.two_factor_enabled',
  'account.two_factor_disabled',
  'account.sessions_revoked',
  'account.username_changed',
  'account.passkey_added',
  'account.passkey_renamed',
  'account.passkey_deleted',
] as const;

/** Password, email, two-step verification, passkeys, devices and apps, recent activity. */
export default async function AccountSecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const activity = await accountActivity().catch(() => ({ items: [] }));

  return (
    <div className={styles.stack}>
      <PageHeader title={t('nav.security')} lead={t('security.lead')} />
      <PasswordSection locale={locale} />
      <EmailSection locale={locale} user={user} />
      <TwoFactorSection locale={locale} />
      <PasskeysPanel locale={locale} />
      <ActiveSessions locale={locale} />
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('security.activityTitle')}</h2>
        {activity.items.length === 0 ? (
          <p className={styles.muted}>{t('security.activityEmpty')}</p>
        ) : (
          <ul className={styles.files}>
            {activity.items.map((item, index) => {
              const known = KNOWN_ACTIONS.find((action) => action === item.action);
              const label = known
                ? t(`security.actions.${known.slice('account.'.length) as 'registered'}`)
                : t('security.actions.other');
              return (
                <li key={`${item.at}-${index}`} className={styles.fileRow}>
                  <div className={styles.fileInfo}>
                    <span className={styles.fileName}>{label}</span>
                    <span className={styles.muted}>{formatDateTime(item.at, locale)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
