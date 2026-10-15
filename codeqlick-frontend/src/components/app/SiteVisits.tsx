import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { SiteVisits as Visits } from '@/lib/api/types';
import styles from './app.module.css';
import { BarChart } from './BarChart';
import own from './SiteVisits.module.css';

export const VISIT_RANGES = [7, 30, 90] as const;
export type VisitRange = (typeof VISIT_RANGES)[number];

/** 90 days are too many bars: group them by week (last bar may be shorter). */
function buckets(daily: Visits['daily'], days: number) {
  if (days <= 30)
    return daily.map((day) => ({ from: day.date, to: day.date, visitors: day.visitors }));
  const weeks: { from: string; to: string; visitors: number }[] = [];
  for (let index = 0; index < daily.length; index += 7) {
    const slice = daily.slice(index, index + 7);
    weeks.push({
      from: slice[0]?.date ?? '',
      to: slice.at(-1)?.date ?? '',
      visitors: slice.reduce((sum, day) => sum + day.visitors, 0),
    });
  }
  return weeks;
}

/**
 * The public site's visits on the admin dashboard, from the self-hosted Umami: totals, a chart,
 * top pages, where visitors come from and contact requests sent. Hidden where analytics isn't
 * set up.
 */
export async function SiteVisits({ visits, locale }: { visits: Visits; locale: AppLocale }) {
  if (!visits.enabled) return null;
  const t = await getTranslations({ locale, namespace: 'Admin.visits' });
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  const countries = new Intl.DisplayNames([locale], { type: 'region' });

  const header = (
    <div className={styles.panelHeader}>
      <h2 className={styles.panelTitle}>{t('title')}</h2>
      <nav className={own.ranges} aria-label={t('range')}>
        {VISIT_RANGES.map((days) => (
          <Link
            key={days}
            href={`/admin?days=${days}`}
            className={days === visits.days ? own.rangeActive : own.range}
            aria-current={days === visits.days ? 'page' : undefined}
          >
            {t('days', { days })}
          </Link>
        ))}
        <a href="https://stats.codeqlick.com" target="_blank" rel="noopener noreferrer">
          {t('openUmami')}
        </a>
      </nav>
    </div>
  );

  if (!visits.available) {
    return (
      <section className={styles.panel}>
        {header}
        <Alert tone="error">{t('unavailable')}</Alert>
      </section>
    );
  }

  const { totals } = visits;
  const change =
    visits.previousVisitors > 0
      ? (totals.visitors - visits.previousVisitors) / visits.previousVisitors
      : null;
  const minutes = Math.floor(totals.avgVisitSeconds / 60);
  const seconds = totals.avgVisitSeconds % 60;
  const bars = buckets(visits.daily, visits.days);
  const weekly = visits.days > 30;

  const cards = [
    {
      label: t('visitors'),
      value: number.format(totals.visitors),
      note:
        change === null
          ? undefined
          : t('change', { value: (change >= 0 ? '+' : '') + percent.format(change) }),
    },
    { label: t('pageviews'), value: number.format(totals.pageviews) },
    { label: t('contactsSent'), value: number.format(visits.contactsSent) },
    { label: t('bounceRate'), value: percent.format(totals.bounceRate) },
    { label: t('avgVisit'), value: `${minutes}:${String(seconds).padStart(2, '0')}` },
  ];

  const list = (title: string, rows: { label: string; value: number }[]) => (
    <div>
      <h3 className={own.listTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p className={styles.muted}>{t('none')}</p>
      ) : (
        <ol className={own.list}>
          {rows.map((row) => (
            <li key={row.label}>
              <span className={own.listLabel}>{row.label}</span>
              <span className={own.listValue}>{number.format(row.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <section className={styles.panel}>
      <div className={styles.stack}>
        {header}
        <ul className={own.cards}>
          {cards.map((card) => (
            <li key={card.label} className={own.card}>
              <span className={styles.statValue}>{card.value}</span>
              <span className={styles.statLabel}>{card.label}</span>
              {card.note ? <span className={own.note}>{card.note}</span> : null}
            </li>
          ))}
        </ul>
        <div className={own.chart}>
          <BarChart
            title={weekly ? t('chartWeekly') : t('chartDaily')}
            labels={bars.map((bar) => date(bar.from, { day: 'numeric' }))}
            longLabels={bars.map((bar) =>
              bar.from === bar.to
                ? date(bar.from, { dateStyle: 'long' })
                : `${date(bar.from, { dateStyle: 'medium' })} – ${date(bar.to, { dateStyle: 'medium' })}`,
            )}
            rowHeading={weekly ? t('week') : t('day')}
            series={[
              {
                label: t('visitors'),
                color: 'var(--color-fuchsia)',
                values: bars.map((bar) => bar.visitors),
              },
            ]}
          />
        </div>
        <div className={own.lists}>
          {list(
            t('topPages'),
            visits.topPages.map((page) => ({ label: page.path, value: page.visitors })),
          )}
          {list(
            t('referrers'),
            visits.referrers.map((ref) => ({ label: ref.source, value: ref.visitors })),
          )}
          {list(
            t('countries'),
            visits.countries.map((country) => ({
              label: countries.of(country.code) ?? country.code,
              value: country.visitors,
            })),
          )}
        </div>
      </div>
    </section>
  );
}
