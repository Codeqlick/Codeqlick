import { buttonClassName } from '@/components/ui/buttonStyles';
import { getTranslations } from 'next-intl/server';
import { BarChart } from '@/components/app/BarChart';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getVideochatHistory, HISTORY_PERIODS, type HistoryPeriod } from '@/lib/api/videochat';
import { firstParam } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ days?: string | string[] }>;
};

/** "1 min 05 s", "45 s"; a dash when there is nothing to average. */
function formatSeconds(seconds: number | null, none: string): string {
  if (seconds === null) return none;
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
}

/** Axis labels: the day of the month, thinned out so they never overlap. */
function dayLabels(dates: string[]): string[] {
  const every = dates.length <= 7 ? 1 : dates.length <= 30 ? 5 : 15;
  return dates.map((date, index) =>
    (dates.length - 1 - index) % every === 0 ? String(Number(date.slice(8))) : '',
  );
}

/** Video chat usage over the last 7, 30 or 90 days (architecture 4.7). */
export default async function AdminVideochatStatsPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminVideochat.history' });
  const requested = Number(firstParam((await searchParams).days));
  const days: HistoryPeriod = HISTORY_PERIODS.find((value) => value === requested) ?? 30;
  const history = await getVideochatHistory(days);
  const { totals } = history;

  const dates = history.days.map((day) => day.date);
  const labels = dayLabels(dates);
  const longLabels = dates.map((date) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`)),
  );
  const hourLabels = history.hours.map((_, hour) => (hour % 3 === 0 ? String(hour) : ''));
  const hourLong = history.hours.map((_, hour) => `${String(hour).padStart(2, '0')}:00`);

  const periodCards = [
    { label: t('activeUsers'), value: totals.activeUsers },
    { label: t('calls'), value: totals.calls },
    { label: t('longCalls'), value: totals.longCalls },
    { label: t('avgDuration'), value: formatSeconds(totals.avgDurationSec, t('none')) },
    { label: t('avgWait'), value: formatSeconds(totals.avgWaitSec, t('none')) },
    { label: t('newMembers'), value: totals.newMembers },
    { label: t('reports'), value: totals.reports },
  ];
  const nowCards = [
    { label: t('members'), value: totals.members },
    { label: t('openReports'), value: totals.openReports },
    { label: t('suspended'), value: totals.suspended },
  ];

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/admin/videochat" variant="outline" size="sm">
            {t('back')}
          </Button>
        }
      />

      <nav className={styles.actions} aria-label={t('period')}>
        {HISTORY_PERIODS.map((value) => (
          <Link
            key={value}
            href={`/admin/videochat/stats?days=${value}`}
            className={buttonClassName({
              variant: value === days ? 'primary' : 'outline',
              size: 'sm',
            })}
            aria-current={value === days ? 'page' : undefined}
          >
            {t(`periods.${value}`)}
          </Link>
        ))}
      </nav>

      <section className={styles.stack} aria-labelledby="videochat-period">
        <h2 id="videochat-period" className={styles.panelTitle}>
          {t('periodTotals')}
        </h2>
        <ul className={styles.stats}>
          {periodCards.map((card) => (
            <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
              <span className={styles.statValue}>{card.value}</span>
              <span className={styles.statLabel}>{card.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.charts}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('activeChart')}</h2>
          <BarChart
            title={t('activeChart')}
            labels={labels}
            longLabels={longLabels}
            rowHeading={t('day')}
            series={[
              {
                label: t('activeSeries'),
                color: 'var(--color-fuchsia)',
                values: history.days.map((day) => day.activeUsers),
              },
            ]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('callsChart')}</h2>
          <BarChart
            title={t('callsChart')}
            labels={labels}
            longLabels={longLabels}
            rowHeading={t('day')}
            series={[
              {
                label: t('longSeries'),
                color: 'var(--color-fuchsia)',
                values: history.days.map((day) => day.longCalls),
              },
              {
                label: t('shortCalls'),
                color: 'var(--color-fuchsia-light)',
                values: history.days.map((day) => day.calls - day.longCalls),
              },
            ]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('hoursChart')}</h2>
          <BarChart
            title={t('hoursChart')}
            labels={hourLabels}
            longLabels={hourLong}
            rowHeading={t('hour')}
            series={[{ label: t('calls'), color: 'var(--color-ink)', values: history.hours }]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('membersChart')}</h2>
          <BarChart
            title={t('membersChart')}
            labels={labels}
            longLabels={longLabels}
            rowHeading={t('day')}
            series={[
              {
                label: t('newMembers'),
                color: 'var(--color-slate)',
                values: history.days.map((day) => day.newMembers),
              },
              {
                label: t('reports'),
                color: 'var(--color-fuchsia-dark)',
                values: history.days.map((day) => day.reports),
              },
            ]}
          />
        </section>
      </div>

      <section className={styles.stack} aria-labelledby="videochat-now">
        <h2 id="videochat-now" className={styles.panelTitle}>
          {t('now')}
        </h2>
        <ul className={styles.stats}>
          {nowCards.map((card) => (
            <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
              <span className={styles.statValue}>{card.value}</span>
              <span className={styles.statLabel}>{card.label}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
