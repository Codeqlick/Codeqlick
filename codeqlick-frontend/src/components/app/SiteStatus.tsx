import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import type { AppLocale } from '@/i18n/routing';
import type { SiteMonitor } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/format';
import styles from './SiteStatus.module.css';

const percent = (ratio: number, locale: string) =>
  new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(ratio);

/** Status, 30-day uptime as one bar per day, certificate expiry and the last check. */
export async function SiteStatus({ monitor, locale }: { monitor: SiteMonitor; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Monitoring' });
  const dayLabel = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const tone =
    monitor.status === 'UP' ? 'success' : monitor.status === 'DOWN' ? 'danger' : 'neutral';

  return (
    <div className={styles.status}>
      <div className={styles.head}>
        <Badge tone={tone}>{t(`statuses.${monitor.status}`)}</Badge>
        <span className={styles.since}>
          {t('since', { date: formatDateTime(monitor.statusSince, locale) })}
        </span>
        {monitor.uptime30 !== null ? (
          <strong className={styles.uptime}>
            {t('uptime', { value: percent(monitor.uptime30, locale) })}
          </strong>
        ) : null}
      </div>
      <ol className={styles.bars} aria-label={t('barsLabel')}>
        {monitor.days.map((day) => {
          const level =
            day.ratio === null
              ? styles.none
              : day.ratio >= 0.995
                ? styles.good
                : day.ratio >= 0.95
                  ? styles.fair
                  : styles.bad;
          const date = dayLabel.format(new Date(`${day.day}T12:00:00Z`));
          const text =
            day.ratio === null
              ? t('noData', { date })
              : t('dayUptime', { date, value: percent(day.ratio, locale) });
          return (
            <li key={day.day} className={`${styles.bar} ${level}`} title={text}>
              <span className="visually-hidden">{text}</span>
            </li>
          );
        })}
      </ol>
      <dl className={styles.facts}>
        {monitor.certExpiresAt ? (
          <div>
            <dt>{t('cert')}</dt>
            <dd>{t('certUntil', { date: formatDate(monitor.certExpiresAt, locale) })}</dd>
          </div>
        ) : null}
        {monitor.lastCheckedAt ? (
          <div>
            <dt>{t('lastCheck')}</dt>
            <dd>{formatDateTime(monitor.lastCheckedAt, locale)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
