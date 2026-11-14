import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudUsage } from '@/lib/api/cloud';
import { formatBytes, usageWarnings } from '@/lib/cloud';
import styles from '../../cloud.module.css';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; team: string }>;
};

/** Every team page: a banner while a limit of the plan is at 80 % or more (architecture 4.13). */
export default async function CloudTeamLayout({ children, params }: LayoutProps) {
  const { locale: raw, team } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });

  // The pages report an unknown team or an API failure themselves; the banner just stays away.
  const usage = await getCloudUsage(team).catch(() => null);
  const warnings = usage ? usageWarnings(usage.meters ?? []) : null;
  const value = (key: string, amount: number) =>
    key === 'storage' ? formatBytes(amount, locale) : String(amount);

  return (
    <div className={styles.teamShell}>
      {warnings ? (
        <section
          className={`${styles.usageBanner} ${warnings.level === 'error' ? styles.usageError : styles.usageWarning}`}
          role={warnings.level === 'error' ? 'alert' : 'status'}
          aria-labelledby="usage-banner-title"
        >
          <h2 id="usage-banner-title" className={styles.usageBannerTitle}>
            {t(warnings.level === 'error' ? 'team.alert.errorTitle' : 'team.alert.warningTitle')}
          </h2>
          <ul className={styles.usageBannerList}>
            {warnings.meters.map((meter) => (
              <li key={meter.key}>
                {t('team.alert.item', {
                  label: t(`team.meters.${meter.key}`),
                  used: value(meter.key, meter.used),
                  limit: value(meter.key, meter.limit),
                  percent: String(meter.percent),
                })}
              </li>
            ))}
          </ul>
          <p className={styles.usageBannerLink}>
            <Link href={`/cloud/console/${encodeURIComponent(team)}`}>{t('team.alert.link')}</Link>
          </p>
        </section>
      ) : null}
      {children}
    </div>
  );
}
