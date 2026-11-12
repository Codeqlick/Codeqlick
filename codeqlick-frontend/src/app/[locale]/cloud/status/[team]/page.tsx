import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MonitorStatus } from '@/components/cloud/MonitorStatus';
import { formatUptime, UptimeBars } from '@/components/cloud/UptimeBars';
import { resolveLocale } from '@/i18n/locale';
import { getCloudPublicStatus, type CloudPublicStatus } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import { webappAlternates } from '@/lib/webapp-seo';
import styles from '../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string; team: string }> };

async function load(team: string): Promise<CloudPublicStatus> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(team)) notFound();
  try {
    return await getCloudPublicStatus(team);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, team } = await params;
  const locale = resolveLocale(raw);
  const status = await load(team);
  const t = await getTranslations({ locale, namespace: 'Cloud.status' });
  return {
    title: { absolute: `${status.title} · ${t('suffix')}` },
    description: status.intro ?? t(`overall.${status.overall}`),
    alternates: webappAlternates('cloud', locale, `/status/${team}`),
  };
}

/** A team's public status page (architecture 4.13, decision 39). */
export default async function PublicStatusPage({ params }: PageProps) {
  const { locale: raw, team } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const status = await load(team);

  return (
    <div className={`${styles.landing} ${styles.docs}`}>
      <div>
        <h1 className={styles.heroTitle}>{status.title}</h1>
        {status.intro ? <p className={styles.muted}>{status.intro}</p> : null}
      </div>
      <p className={`${styles.overall} ${styles[`overall_${status.overall}`]}`}>
        {t(`status.overall.${status.overall}`)}
      </p>
      <ul className={styles.list}>
        {status.monitors.map((monitor) => (
          <li key={monitor.label} className={styles.card}>
            <p className={styles.rowTitle}>
              {monitor.label}
              <MonitorStatus
                status={monitor.status}
                label={t(`monitors.states.${monitor.status}`)}
              />
              <span className={styles.small}>
                {t('status.uptime', { value: formatUptime(monitor.uptime90, locale) })}
              </span>
            </p>
            <UptimeBars
              days={monitor.days}
              locale={locale}
              label={t('status.uptime', { value: formatUptime(monitor.uptime90, locale) })}
            />
            {monitor.incidents.length > 0 ? (
              <ul className={styles.incidentList}>
                {monitor.incidents.map((incident) => (
                  <li key={incident.start} className={styles.small}>
                    {formatWhen(incident.start, locale)} ·{' '}
                    {incident.end
                      ? t('monitors.lasted', { minutes: incident.minutes })
                      : t('monitors.ongoing')}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={styles.small}>
        {t('status.updated', { when: formatWhen(status.updatedAt, locale) })} ·{' '}
        {t('status.poweredBy')}
      </p>
    </div>
  );
}
