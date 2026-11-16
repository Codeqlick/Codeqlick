import { getTranslations } from 'next-intl/server';
import { BarChart } from '@/components/app/BarChart';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { resolveLocale } from '@/i18n/locale';
import { getAdminCruisingStats } from '@/lib/api/cruising-stats';
import { countryName } from '@/lib/cruising';
import type { CruisingCityStat, CruisingCountryStat } from '@/lib/cruising-stats';
import { weekLabels, weeksTotal } from '@/lib/cruising-stats';
import { formatDateTime } from '@/lib/format';

type PageProps = { params: Promise<{ locale: string }> };

type TopT = Awaited<ReturnType<typeof getTranslations<'AdminCruisingStats'>>>;

/** A top-10 table of places: country (and city) and how many. */
function TopTable({
  t,
  locale,
  caption,
  countLabel,
  rows,
}: {
  t: TopT;
  locale: string;
  caption: string;
  countLabel: string;
  rows: (CruisingCountryStat | CruisingCityStat)[];
}) {
  const cities = rows.some((row) => 'city' in row);
  if (rows.length === 0) {
    return (
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>{caption}</h3>
        <p className={styles.muted}>{t('none')}</p>
      </section>
    );
  }
  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>{caption}</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              {cities ? <th scope="col">{t('city')}</th> : null}
              <th scope="col">{t('country')}</th>
              <th scope="col">{countLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={'citySlug' in row ? `${row.countryCode}/${row.citySlug}` : row.countryCode}>
                <td>{index + 1}</td>
                {'city' in row ? <th scope="row">{row.city}</th> : null}
                {'city' in row ? (
                  <td>{countryName(row.countryCode, locale)}</td>
                ) : (
                  <th scope="row">{countryName(row.countryCode, locale)}</th>
                )}
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Admin → Cruising → Statistics (decision 101): 12 weeks of aggregates and the top places. */
export default async function AdminCruisingStatsPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminCruisingStats' });
  const stats = await getAdminCruisingStats();
  const { weeks } = stats;
  const { labels, longLabels } = weekLabels(
    weeks.map((week) => week.start),
    locale,
  );
  const chart = { labels, longLabels, rowHeading: t('week') };
  const values = (pick: (week: (typeof weeks)[number]) => number) => weeks.map(pick);
  const decided = weeks.filter((week) => week.medianDecisionHours !== null);

  const cards = [
    { label: t('members'), value: weeksTotal(weeks, (week) => week.members) },
    { label: t('activeThisWeek'), value: weeks.at(-1)?.active ?? 0 },
    {
      label: t('spots'),
      value: weeksTotal(
        weeks,
        (week) => week.spots.pending + week.spots.live + week.spots.rejected,
      ),
    },
    { label: t('checkIns'), value: weeksTotal(weeks, (week) => week.checkIns) },
    { label: t('messages'), value: weeksTotal(weeks, (week) => week.messages) },
    { label: t('reportsOpened'), value: weeksTotal(weeks, (week) => week.reportsOpened) },
  ];

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        back={{ href: '/admin/cruising', label: t('back') }}
      />

      <section className={styles.stack} aria-labelledby="cruising-stats-totals">
        <h2 id="cruising-stats-totals" className={styles.panelTitle}>
          {t('totals')}
        </h2>
        <ul className={styles.stats}>
          {cards.map((card) => (
            <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
              <span className={styles.statValue}>{card.value}</span>
              <span className={styles.statLabel}>{card.label}</span>
            </li>
          ))}
        </ul>
        <p className={styles.muted}>
          {t('generated', { time: formatDateTime(stats.generatedAt, locale) })} {t('retention')}
        </p>
      </section>

      <div className={styles.charts}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('membersChart')}</h2>
          <BarChart
            title={t('membersChart')}
            {...chart}
            series={[
              {
                label: t('members'),
                color: 'var(--color-fuchsia)',
                values: values((w) => w.members),
              },
            ]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('activeChart')}</h2>
          <BarChart
            title={t('activeChart')}
            {...chart}
            series={[
              { label: t('active'), color: 'var(--color-ink)', values: values((w) => w.active) },
            ]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('spotsChart')}</h2>
          <BarChart
            title={t('spotsChart')}
            {...chart}
            series={[
              {
                label: t('spotsLive'),
                color: 'var(--color-fuchsia)',
                values: values((w) => w.spots.live),
              },
              {
                label: t('spotsPending'),
                color: 'var(--color-fuchsia-light)',
                values: values((w) => w.spots.pending),
              },
              {
                label: t('spotsRejected'),
                color: 'var(--color-slate)',
                values: values((w) => w.spots.rejected),
              },
            ]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('activityChart')}</h2>
          <BarChart
            title={t('activityChart')}
            {...chart}
            series={[
              {
                label: t('checkIns'),
                color: 'var(--color-fuchsia)',
                values: values((w) => w.checkIns),
              },
              {
                label: t('meetups'),
                color: 'var(--color-fuchsia-dark)',
                values: values((w) => w.meetups),
              },
              { label: t('media'), color: 'var(--color-slate)', values: values((w) => w.media) },
            ]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('messagesChart')}</h2>
          <BarChart
            title={t('messagesChart')}
            {...chart}
            series={[
              {
                label: t('messages'),
                color: 'var(--color-ink)',
                values: values((w) => w.messages),
              },
              {
                label: t('roomMessages'),
                color: 'var(--color-fuchsia-light)',
                values: values((w) => w.roomMessages),
              },
            ]}
          />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('moderationChart')}</h2>
          <BarChart
            title={t('moderationChart')}
            {...chart}
            series={[
              {
                label: t('reportsOpened'),
                color: 'var(--color-fuchsia-dark)',
                values: values((w) => w.reportsOpened),
              },
              {
                label: t('takedowns'),
                color: 'var(--color-slate)',
                values: values((w) => w.takedowns),
              },
            ]}
          />
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="cruising-stats-decisions">
        <h2 id="cruising-stats-decisions" className={styles.panelTitle}>
          {t('decisionsTitle')}
        </h2>
        <p className={styles.muted}>{t('decisionsLead')}</p>
        {decided.length === 0 ? (
          <p>{t('none')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">{t('decisionsTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('week')}</th>
                  <th scope="col">{t('reportsDecided')}</th>
                  <th scope="col">{t('medianHours')}</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, index) =>
                  week.reportsDecided > 0 ? (
                    <tr key={week.start}>
                      <th scope="row">{longLabels[index]}</th>
                      <td>{week.reportsDecided}</td>
                      <td>
                        {week.medianDecisionHours === null
                          ? '–'
                          : t('hours', { hours: week.medianDecisionHours })}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.stack} aria-labelledby="cruising-stats-places">
        <h2 id="cruising-stats-places" className={styles.panelTitle}>
          {t('placesTitle')}
        </h2>
        <div className={styles.charts}>
          <TopTable
            t={t}
            locale={locale}
            caption={t('topCountriesSpots')}
            countLabel={t('liveSpots')}
            rows={stats.topCountries.spots}
          />
          <TopTable
            t={t}
            locale={locale}
            caption={t('topCitiesSpots')}
            countLabel={t('liveSpots')}
            rows={stats.topCities.spots}
          />
          <TopTable
            t={t}
            locale={locale}
            caption={t('topCountriesCheckIns')}
            countLabel={t('checkIns')}
            rows={stats.topCountries.checkIns}
          />
          <TopTable
            t={t}
            locale={locale}
            caption={t('topCitiesCheckIns')}
            countLabel={t('checkIns')}
            rows={stats.topCities.checkIns}
          />
        </div>
      </section>
    </div>
  );
}
