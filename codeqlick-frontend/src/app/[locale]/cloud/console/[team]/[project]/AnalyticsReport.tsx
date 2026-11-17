import { getTranslations } from 'next-intl/server';
import { Tabs } from '@/components/ui/Tabs';
import type { AppLocale } from '@/i18n/routing';
import type {
  CloudAnalyticsPeriod,
  CloudAnalyticsReport,
  CloudAnalyticsRow,
} from '@/lib/api/cloud';
import { changeAgainst } from '@/lib/analytics-change';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../cloud.module.css';
import { AnalyticsChange } from './AnalyticsChange';

export const ANALYTICS_PERIODS: readonly CloudAnalyticsPeriod[] = [
  '24h',
  '7d',
  '30d',
  '90d',
  '365d',
];

type Props = {
  locale: AppLocale;
  report: CloudAnalyticsReport;
  period: CloudAnalyticsPeriod;
  /** Where the link of a period goes (the console tab, or the public page). */
  periodHref: (period: CloudAnalyticsPeriod) => string;
  /** The console's CSV download of the period; the public page has none. */
  csvHref?: string;
};

/** The numbers of a project's analytics, read-only: the console tab and the public link show it. */
export async function AnalyticsReport(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const { report } = props;
  const number = new Intl.NumberFormat(props.locale);
  const max = Math.max(1, ...report.series.map((point) => point.pageviews));
  const hourly = props.period === '24h';
  const label = (t: string) =>
    hourly
      ? new Intl.DateTimeFormat(props.locale, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Madrid',
        }).format(new Date(t))
      : new Intl.DateTimeFormat(props.locale, {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }).format(new Date(`${t}T12:00:00Z`));
  const changeLine = (current: number, previous: number) => {
    const change = report.previous.complete ? changeAgainst(current, previous) : null;
    if (!change) return null;
    const against = t(`analytics.previous.${props.period}`);
    return (
      <AnalyticsChange
        change={change}
        text={(value) => t('analytics.changeVs', { value, previous: against })}
        newLabel={t('analytics.changeNew')}
        classNames={{
          up: `${styles.change} ${styles.changeUp}`,
          down: `${styles.change} ${styles.changeDown}`,
          same: styles.change,
          new: `${styles.change} ${styles.changeUp}`,
        }}
      />
    );
  };
  const first = report.series[0];
  const last = report.series.at(-1);

  const table = (caption: string, rows: CloudAnalyticsRow[], countLabel: string) => (
    <table className={styles.top}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="visually-hidden">{caption}</span>
          </th>
          <th scope="col">{t('analytics.visitors')}</th>
          <th scope="col">{countLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={3} className={styles.muted}>
              {t('analytics.none')}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.key}>
              <td>{row.key}</td>
              <td>{number.format(row.visitors)}</td>
              <td>{number.format(row.count)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <>
      <Tabs
        variant="pills"
        label={t('analytics.period')}
        items={ANALYTICS_PERIODS.map((period) => ({
          href: props.periodHref(period),
          label: t(`analytics.periods.${period}`),
          current: props.period === period,
        }))}
      />
      {props.csvHref ? (
        <p className={styles.small}>
          <a href={props.csvHref} download>
            {t('analytics.csv')}
          </a>
        </p>
      ) : null}

      <div className={styles.meters}>
        <div className={styles.meter}>
          <span className={styles.small}>{t('analytics.visitors')}</span>
          <span className={styles.meterValue}>{number.format(report.totals.visitors)}</span>
          {changeLine(report.totals.visitors, report.previous.visitors)}
        </div>
        <div className={styles.meter}>
          <span className={styles.small}>{t('analytics.pageviews')}</span>
          <span className={styles.meterValue}>{number.format(report.totals.pageviews)}</span>
          {changeLine(report.totals.pageviews, report.previous.pageviews)}
        </div>
      </div>

      <figure className={`${appUi.card} ${styles.chartFigure}`}>
        <p className="visually-hidden">
          {t('analytics.chart', {
            pageviews: number.format(report.totals.pageviews),
            period: t(`analytics.periods.${props.period}`),
          })}
        </p>
        <div className={styles.chart} aria-hidden="true">
          {report.series.map((point) => (
            <span
              key={point.t}
              title={`${label(point.t)} · ${t('analytics.tooltip', {
                pageviews: point.pageviews,
                visitors: point.visitors,
              })}`}
              style={{ height: `${Math.round((point.pageviews / max) * 100)}%` }}
              data-empty={point.pageviews === 0 ? '' : undefined}
            />
          ))}
        </div>
        {first && last ? (
          <figcaption className={`${styles.chartAxis} ${styles.small}`}>
            <span>{label(first.t)}</span>
            <span>{label(last.t)}</span>
          </figcaption>
        ) : null}
      </figure>

      <div className={styles.tops}>
        {table(t('analytics.pages'), report.pages, t('analytics.pageviews'))}
        {table(t('analytics.referrers'), report.referrers, t('analytics.pageviews'))}
        {table(t('analytics.customEvents'), report.events, t('analytics.count'))}
        {table(t('analytics.browsers'), report.browsers, t('analytics.pageviews'))}
        {table(t('analytics.os'), report.os, t('analytics.pageviews'))}
        {table(
          t('analytics.devices'),
          report.devices.map((row) => ({
            ...row,
            key:
              row.key === 'mobile' || row.key === 'tablet' || row.key === 'desktop'
                ? t(`analytics.deviceNames.${row.key}`)
                : row.key,
          })),
          t('analytics.pageviews'),
        )}
      </div>
    </>
  );
}
