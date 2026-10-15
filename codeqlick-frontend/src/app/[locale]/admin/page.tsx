import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { ActivityList } from '@/components/app/ActivityList';
import { BarChart } from '@/components/app/BarChart';
import { PageHeader } from '@/components/app/PageHeader';
import { SiteVisits, VISIT_RANGES, type VisitRange } from '@/components/app/SiteVisits';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListActivity } from '@/lib/api/activity';
import type { SiteVisits as Visits } from '@/lib/api/types';
import { getAdminStats, getAdminTimeline, getSiteVisits } from '@/lib/api/stats';
import { firstParam } from '@/lib/format';

/** Visits are optional: an API error there must not take the dashboard down. */
async function loadVisits(days: VisitRange): Promise<Visits | undefined> {
  try {
    return await getSiteVisits(days);
  } catch {
    return undefined;
  }
}

export default async function AdminDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const locale = resolveLocale((await params).locale);
  const requested = Number(firstParam((await searchParams).days));
  const days: VisitRange = VISIT_RANGES.find((range) => range === requested) ?? 30;
  const t = await getTranslations({ locale, namespace: 'Admin.dashboard' });
  const ta = await getTranslations({ locale, namespace: 'App' });
  const tr = await getTranslations({ locale, namespace: 'LostReasons' });
  const tl = await getTranslations({ locale, namespace: 'Admin.leads' });
  const [stats, activity, timeline, visits] = await Promise.all([
    getAdminStats(),
    adminListActivity({ pageSize: 6 }),
    getAdminTimeline(12),
    loadVisits(days),
  ]);

  // `yyyy-mm` → "oct" on the axis, "octubre de 2026" in the table read by screen readers.
  const monthDate = (month: string) => new Date(`${month}-15T12:00:00Z`);
  const months = timeline.months;
  const shortMonths = months.map((m) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(monthDate(m.month)),
  );
  const longMonths = months.map((m) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      monthDate(m.month),
    ),
  );

  const cards = [
    { href: '/admin/leads?status=NEW', label: t('newLeads'), value: stats.leads.new },
    { href: '/admin/leads', label: t('totalLeads'), value: stats.leads.total },
    { href: '/admin/bookings', label: t('upcomingCalls'), value: stats.bookings.upcoming },
    { href: '/admin/drafts', label: t('pendingDrafts'), value: stats.drafts.pending },
    {
      href: '/admin/proposals?status=SENT',
      label: t('sentProposals'),
      value: stats.proposals.sent,
    },
    { href: '/admin/support', label: t('activeTickets'), value: stats.support.active },
    { href: '/admin/posts', label: t('publishedPosts'), value: stats.posts.published },
    { href: '/admin/posts', label: t('draftPosts'), value: stats.posts.drafts },
    { href: '/admin/posts', label: t('scheduledPosts'), value: stats.posts.scheduled },
    { href: '/admin/portfolio', label: t('publishedPortfolio'), value: stats.portfolio.published },
    { href: '/admin/projects', label: t('activeProjects'), value: stats.projects.active },
    { href: '/admin/users', label: t('clients'), value: stats.clients },
  ];

  return (
    <>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/" variant="outline" size="sm">
            {ta('viewSite')}
          </Button>
        }
      />
      <div className={styles.stack}>
        <ul className={styles.stats}>
          {cards.map((card) => (
            <li key={card.label}>
              <Link href={card.href} className={`${styles.panel} ${styles.stat}`}>
                <span className={styles.statValue}>{card.value}</span>
                <span className={styles.statLabel}>{card.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {visits ? <SiteVisits visits={visits} locale={locale} /> : null}

        <div className={styles.charts}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('leadsChart')}</h2>
            <BarChart
              title={t('leadsChart')}
              labels={shortMonths}
              longLabels={longMonths}
              rowHeading={t('month')}
              series={[
                {
                  label: t('leadsWon'),
                  color: 'var(--color-fuchsia)',
                  values: months.map((m) => m.leadsWon),
                },
                {
                  label: t('leadsOther'),
                  color: 'var(--color-fuchsia-light)',
                  values: months.map((m) => m.leads - m.leadsWon),
                },
              ]}
            />
          </section>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('contentChart')}</h2>
            <BarChart
              title={t('contentChart')}
              labels={shortMonths}
              longLabels={longMonths}
              rowHeading={t('month')}
              series={[
                {
                  label: t('postsSeries'),
                  color: 'var(--color-ink)',
                  values: months.map((m) => m.posts),
                },
                {
                  label: t('caseStudiesSeries'),
                  color: 'var(--color-slate)',
                  values: months.map((m) => m.caseStudies),
                },
              ]}
            />
          </section>
        </div>

        {stats.leads.lostReasons.length > 0 ? (
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('lostReasons')}</h2>
            <ul className={styles.files}>
              {stats.leads.lostReasons.map((entry) => (
                <li key={entry.reason ?? 'none'} className={styles.fileRow}>
                  <span>{entry.reason ? tr(entry.reason) : tl('noReason')}</span>
                  <strong>{entry.count}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {activity.items.length > 0 ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t('recentActivity')}</h2>
              <Link href="/admin/activity">{t('allActivity')}</Link>
            </div>
            <ActivityList entries={activity.items} locale={locale} />
          </section>
        ) : null}
      </div>
    </>
  );
}
