import { getTranslations } from 'next-intl/server';
import { CopyLink } from '@/components/app/CopyLink';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import {
  getCloudAnalytics,
  type CloudAnalyticsPeriod,
  type CloudAnalyticsRow,
} from '@/lib/api/cloud';
import { toggleAnalyticsAction } from '../../../actions';
import styles from '../../../cloud.module.css';

export const ANALYTICS_PERIODS: readonly CloudAnalyticsPeriod[] = [
  '24h',
  '7d',
  '30d',
  '90d',
  '365d',
];

type Props = {
  locale: AppLocale;
  projectId: string;
  path: string;
  base: string;
  admin: boolean;
  period: CloudAnalyticsPeriod;
};

/** A project's web analytics (architecture 4.13 "Web analytics", decision 44). */
export async function AnalyticsTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const report = await getCloudAnalytics(props.projectId, props.period).catch(() => null);
  if (!report) return <p className={styles.muted}>{t('common.loadError')}</p>;
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
    <section className={styles.landing} aria-labelledby="analytics-title">
      <div>
        <h2 id="analytics-title" className={styles.sectionTitle}>
          {t('project.tabs.analytics')}{' '}
          <Badge tone={report.enabled ? 'success' : 'neutral'}>
            {report.enabled ? t('analytics.on') : t('analytics.off')}
          </Badge>
        </h2>
        <p className={styles.muted}>{t('analytics.lead')}</p>
      </div>

      <article className={`${styles.card} ${styles.narrow}`}>
        <p className={styles.small}>{t('analytics.snippetHelp')}</p>
        <CopyLink
          url={report.snippet}
          labels={{ copy: t('common.copy'), copied: t('common.copied') }}
        />
        <p className={styles.small}>{t('analytics.events')}</p>
        <pre className={styles.terminal}>{"codeqlick.track('signup')"}</pre>
        {props.admin ? (
          <form action={toggleAnalyticsAction}>
            <input type="hidden" name="locale" value={props.locale} />
            <input type="hidden" name="project" value={props.projectId} />
            <input type="hidden" name="path" value={props.path} />
            <input type="hidden" name="enabled" value={report.enabled ? 'off' : 'on'} />
            <SubmitButton size="sm" variant={report.enabled ? 'outline' : 'primary'}>
              {report.enabled ? t('analytics.turnOff') : t('analytics.turnOn')}
            </SubmitButton>
          </form>
        ) : null}
        <p className={styles.small}>{t('analytics.privacy')}</p>
      </article>

      <nav className={styles.tabs} aria-label={t('analytics.period')}>
        {ANALYTICS_PERIODS.map((period) => (
          <Link
            key={period}
            href={`${props.base}?tab=analytics&period=${period}`}
            className={styles.tab}
            aria-current={props.period === period ? 'page' : undefined}
          >
            {t(`analytics.periods.${period}`)}
          </Link>
        ))}
      </nav>

      <div className={styles.meters}>
        <div className={styles.meter}>
          <span className={styles.small}>{t('analytics.visitors')}</span>
          <span className={styles.meterValue}>{number.format(report.totals.visitors)}</span>
        </div>
        <div className={styles.meter}>
          <span className={styles.small}>{t('analytics.pageviews')}</span>
          <span className={styles.meterValue}>{number.format(report.totals.pageviews)}</span>
        </div>
      </div>

      <figure className={`${styles.card} ${styles.chartFigure}`}>
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
    </section>
  );
}
