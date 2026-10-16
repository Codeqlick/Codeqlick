import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectVisits } from '@/lib/api/types';
import { BarChart } from './BarChart';
import styles from './app.module.css';

/** "Visitas de tu web": the managed site's last 30 days (portal and admin project pages). */
export async function ProjectVisitsPanel({
  visits,
  locale,
}: {
  visits: ProjectVisits;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: 'ProjectVisits' });
  if (!visits.enabled) return <p className={styles.muted}>{t('notYet')}</p>;
  if (!visits.available) return <p className={styles.muted}>{t('unavailable')}</p>;
  const date = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(
      new Date(`${day}T12:00:00Z`),
    );

  return (
    <div className={styles.stack}>
      <dl className={styles.facts}>
        <div>
          <dt>{t('visitors')}</dt>
          <dd>{visits.visitors}</dd>
        </div>
        <div>
          <dt>{t('pageviews')}</dt>
          <dd>{visits.pageviews}</dd>
        </div>
        <div>
          <dt>{t('messages')}</dt>
          <dd>{visits.messages}</dd>
        </div>
      </dl>
      {visits.daily.length > 0 ? (
        <BarChart
          title={t('chart', { days: visits.days })}
          labels={visits.daily.map((day) => date(day.date, { day: 'numeric' }))}
          longLabels={visits.daily.map((day) => date(day.date, { dateStyle: 'long' }))}
          rowHeading={t('day')}
          series={[
            {
              label: t('visitors'),
              color: 'var(--color-fuchsia)',
              values: visits.daily.map((day) => day.visitors),
            },
          ]}
        />
      ) : null}
      {visits.referrers.length > 0 ? (
        <div>
          <h3 className={styles.panelTitle}>{t('sources')}</h3>
          <ul className={styles.simpleList}>
            {visits.referrers.map((referrer) => (
              <li key={referrer.source}>
                <span>{referrer.source || t('direct')}</span>
                <span>{t('visitorsCount', { count: referrer.visitors })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className={styles.muted}>{t('privacy')}</p>
    </div>
  );
}
