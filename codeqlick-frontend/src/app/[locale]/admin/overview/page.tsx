import { getTranslations } from 'next-intl/server';
import { BarChart, type BarSeries } from '@/components/app/BarChart';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  diskUsedPercent,
  moderationWaiting,
  OVERVIEW_APPS,
  overviewWeekLabels,
  sumWeeks,
  unpricedSubscriptions,
  type OverviewWeek,
} from '@/lib/admin-overview';
import { getAdminOverview } from '@/lib/api/overview';
import { formatBytes } from '@/lib/cloud';
import { formatDateTime, formatMoney } from '@/lib/format';

type PageProps = { params: Promise<{ locale: string }> };

const APP_COLORS = [
  'var(--color-fuchsia)',
  'var(--color-fuchsia-dark)',
  'var(--color-fuchsia-light)',
  'var(--color-ink)',
  'var(--color-slate)',
  'var(--color-info)',
  'var(--color-success)',
];

/** Admin → Overview (architecture 4.17, decision 122): the whole platform, aggregates only. */
export default async function AdminOverviewPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminOverview' });
  const overview = await getAdminOverview();
  const { weeks, people, revenue, activity, health } = overview;
  const { labels, longLabels } = overviewWeekLabels(
    weeks.map((week) => week.start),
    locale,
  );
  const chart = { labels, longLabels, rowHeading: t('week') };
  const money = (cents: number) => formatMoney(cents, revenue.currency, locale);
  const current = weeks.at(-1);
  const unpriced = unpricedSubscriptions(revenue);
  const waiting = moderationWaiting(health.moderation);

  /** One weekly series as its own chart panel. */
  const single = (title: string, color: string, pick: (week: OverviewWeek) => number) => (
    <section className={styles.panel} key={title}>
      <h3 className={styles.panelTitle}>{title}</h3>
      <BarChart
        title={title}
        {...chart}
        series={[{ label: title, color, values: weeks.map(pick) }]}
      />
    </section>
  );

  const diskTone =
    health.disk?.state === 'full' ? 'danger' : health.disk?.state === 'low' ? 'warning' : 'success';

  const cards = [
    { href: '/admin/users', label: t('cards.accounts'), value: String(people.accounts) },
    { href: null, label: t('cards.active'), value: String(current?.accounts.active ?? 0) },
    { href: null, label: t('cards.mrr'), value: money(revenue.mrrCents) },
    { href: '/admin/leads', label: t('cards.leads'), value: String(current?.leads ?? 0) },
    { href: '/admin/support', label: t('cards.supportOpen'), value: String(activity.supportOpen) },
    {
      href: '/admin/cloud',
      label: t('cards.disk'),
      value: health.disk ? formatBytes(health.disk.freeBytes, locale) : '–',
    },
  ];

  const appSeries: BarSeries[] = OVERVIEW_APPS.map((app, index) => ({
    label: t(`apps.${app}`),
    color: APP_COLORS[index] ?? 'var(--color-slate)',
    values: weeks.map((week) => week.apps[app]),
  }));

  const { cruising, swipe, videochat } = health.moderation;
  const queues = [
    {
      app: t('apps.cruising'),
      what: t('moderation.spots'),
      count: cruising.spots,
      href: '/admin/cruising?tab=queue',
    },
    {
      app: t('apps.cruising'),
      what: t('moderation.reports'),
      count: cruising.reports,
      href: '/admin/cruising?tab=reports',
    },
    {
      app: t('apps.cruising'),
      what: t('moderation.media'),
      count: cruising.media,
      href: '/admin/cruising?tab=media',
    },
    {
      app: t('apps.cruising'),
      what: t('moderation.verifications'),
      count: cruising.verifications,
      href: '/admin/cruising?tab=verifications',
    },
    {
      app: t('apps.cruising'),
      what: t('moderation.takedowns'),
      count: cruising.takedowns,
      href: '/admin/cruising?tab=takedowns',
    },
    {
      app: t('apps.swipe'),
      what: t('moderation.photos'),
      count: swipe.photos,
      href: '/admin/swipe?tab=queue',
    },
    {
      app: t('apps.swipe'),
      what: t('moderation.reports'),
      count: swipe.reports,
      href: '/admin/swipe?tab=reports',
    },
    {
      app: t('apps.swipe'),
      what: t('moderation.verifications'),
      count: swipe.verifications,
      href: '/admin/swipe?tab=queue',
    },
    {
      app: t('apps.swipe'),
      what: t('moderation.takedowns'),
      count: swipe.takedowns,
      href: '/admin/swipe?tab=takedowns',
    },
    {
      app: t('apps.videochat'),
      what: t('moderation.reports'),
      count: videochat.reports,
      href: '/admin/videochat',
    },
    {
      app: t('apps.videochat'),
      what: t('moderation.appeals'),
      count: videochat.appeals,
      href: '/admin/videochat',
    },
    {
      app: t('apps.videochat'),
      what: t('moderation.verifications'),
      count: videochat.verifications,
      href: '/admin/videochat',
    },
  ];

  const purchaseWeeks = weeks
    .map((week, index) => ({ week, label: longLabels[index] }))
    .filter(({ week }) => week.purchases.count > 0);

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />

      <section className={styles.stack} aria-labelledby="overview-totals">
        <h2 id="overview-totals" className="visually-hidden">
          {t('totals')}
        </h2>
        <ul className={styles.stats}>
          {cards.map((card) => (
            <li key={card.label}>
              {card.href ? (
                <Link href={card.href} className={`${styles.panel} ${styles.stat}`}>
                  <span className={styles.statValue}>{card.value}</span>
                  <span className={styles.statLabel}>{card.label}</span>
                </Link>
              ) : (
                <div className={`${styles.panel} ${styles.stat}`}>
                  <span className={styles.statValue}>{card.value}</span>
                  <span className={styles.statLabel}>{card.label}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className={styles.muted}>
          {t('generated', { time: formatDateTime(overview.generatedAt, locale) })}
        </p>
      </section>

      {/* People */}
      <section className={styles.stack} aria-labelledby="overview-people">
        <h2 id="overview-people" className={styles.panelTitle}>
          {t('people.title')}
        </h2>
        <div className={styles.charts}>
          {single(t('people.newChart'), 'var(--color-fuchsia)', (w) => w.accounts.new)}
          {single(t('people.activeChart'), 'var(--color-ink)', (w) => w.accounts.active)}
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>{t('people.appsChart')}</h3>
            <BarChart title={t('people.appsChart')} {...chart} series={appSeries} />
          </section>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>{t('people.appsTable')}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="visually-hidden">{t('people.appsTable')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('people.app')}</th>
                    <th scope="col">{t('people.now')}</th>
                    <th scope="col">{t('people.new12')}</th>
                  </tr>
                </thead>
                <tbody>
                  {OVERVIEW_APPS.map((app) => (
                    <tr key={app}>
                      <th scope="row">{t(`apps.${app}`)}</th>
                      <td>{people.apps[app]}</td>
                      <td>{sumWeeks(weeks, (week) => week.apps[app])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <p className={styles.muted}>{t('people.activeNote')}</p>
      </section>

      {/* Revenue */}
      <section className={styles.stack} aria-labelledby="overview-revenue">
        <h2 id="overview-revenue" className={styles.panelTitle}>
          {t('revenue.title')}
        </h2>
        <div className={styles.charts}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>{t('revenue.mrrTable')}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="visually-hidden">{t('revenue.mrrTable')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('revenue.plan')}</th>
                    <th scope="col">{t('revenue.subscriptions')}</th>
                    <th scope="col">{t('revenue.mrr')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{t('revenue.cloudPro')}</th>
                    <td>{revenue.cloudPro.active}</td>
                    <td>{money(revenue.cloudPro.mrrCents)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('revenue.maintenance')}</th>
                    <td>{revenue.maintenance.paid}</td>
                    <td>{money(revenue.maintenance.mrrCents)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('revenue.included')}</th>
                    <td>{revenue.maintenance.included}</td>
                    <td>{money(0)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('revenue.total')}</th>
                    <td>{revenue.cloudPro.active + revenue.maintenance.paid}</td>
                    <td>
                      <strong>{money(revenue.mrrCents)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={styles.muted}>
              {t('revenue.mrrNote')}
              {unpriced > 0 ? ` ${t('revenue.unpriced', { count: unpriced })}` : ''}
            </p>
          </section>
          {single(t('revenue.purchasesChart'), 'var(--color-fuchsia)', (w) => w.purchases.count)}
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>{t('revenue.purchasesTable')}</h3>
            {purchaseWeeks.length === 0 ? (
              <p className={styles.muted}>{t('none')}</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className="visually-hidden">{t('revenue.purchasesTable')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('week')}</th>
                      <th scope="col">{t('revenue.purchases')}</th>
                      <th scope="col">{t('revenue.charged')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseWeeks.map(({ week, label }) => (
                      <tr key={week.start}>
                        <th scope="row">{label}</th>
                        <td>{week.purchases.count}</td>
                        <td>{money(week.purchases.amountCents)}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row">{t('revenue.total')}</th>
                      <td>{sumWeeks(weeks, (w) => w.purchases.count)}</td>
                      <td>{money(sumWeeks(weeks, (w) => w.purchases.amountCents))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>

      {/* Activity */}
      <section className={styles.stack} aria-labelledby="overview-activity">
        <h2 id="overview-activity" className={styles.panelTitle}>
          {t('activity.title')}
        </h2>
        <p className={styles.muted}>
          {t('activity.totals', {
            open: activity.supportOpen,
            subscribers: activity.newsletterActive,
          })}
        </p>
        <div className={styles.charts}>
          {single(t('activity.leads'), 'var(--color-fuchsia)', (w) => w.leads)}
          {single(
            t('activity.supportOpened'),
            'var(--color-fuchsia-dark)',
            (w) => w.support.opened,
          )}
          {single(t('activity.supportClosed'), 'var(--color-slate)', (w) => w.support.closed)}
          {single(t('activity.deployments'), 'var(--color-ink)', (w) => w.deployments)}
          {single(t('activity.siteChecks'), 'var(--color-fuchsia-light)', (w) => w.siteChecks)}
          {single(t('activity.newsletter'), 'var(--color-fuchsia)', (w) => w.newsletter)}
        </div>
      </section>

      {/* Health */}
      <section className={styles.stack} aria-labelledby="overview-health">
        <h2 id="overview-health" className={styles.panelTitle}>
          {t('health.title')}
        </h2>
        <div className={styles.charts}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>{t('health.server')}</h3>
            <ul className={styles.files}>
              <li className={styles.fileRow}>
                <span>{t('health.disk')}</span>
                {health.disk ? (
                  <span>
                    <Badge tone={diskTone}>{t(`health.diskState.${health.disk.state}`)}</Badge>{' '}
                    {t('health.diskFree', {
                      free: formatBytes(health.disk.freeBytes, locale),
                      total: formatBytes(health.disk.totalBytes, locale),
                      used: diskUsedPercent(health.disk),
                    })}
                  </span>
                ) : (
                  <span>{t('health.diskUnknown')}</span>
                )}
              </li>
              <li className={styles.fileRow}>
                <Link href="/admin/errors">{t('health.errors')}</Link>
                <strong>{health.errors.open}</strong>
              </li>
              <li className={styles.fileRow}>
                <Link href="/admin/errors">{t('health.csp')}</Link>
                <strong>{health.errors.cspOpen}</strong>
              </li>
              <li className={styles.fileRow}>
                <Link href="/admin/monitoring">{t('health.monitors')}</Link>
                <strong>
                  {t('health.monitorsValue', {
                    down: health.monitors.down,
                    watched: health.monitors.watched,
                  })}
                </strong>
              </li>
            </ul>
            <p className={styles.muted}>{t('health.uptimeNote')}</p>
          </section>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>{t('health.moderation', { count: waiting })}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="visually-hidden">
                  {t('health.moderation', { count: waiting })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t('people.app')}</th>
                    <th scope="col">{t('health.queue')}</th>
                    <th scope="col">{t('health.waiting')}</th>
                  </tr>
                </thead>
                <tbody>
                  {queues.map((queue) => (
                    <tr key={`${queue.app}-${queue.what}`}>
                      <td>{queue.app}</td>
                      <th scope="row">
                        <Link href={queue.href}>{queue.what}</Link>
                      </th>
                      <td>{queue.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
