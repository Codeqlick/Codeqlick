import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { ActivityList } from '@/components/app/ActivityList';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListActivity } from '@/lib/api/activity';
import { getAdminStats } from '@/lib/api/stats';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.dashboard' });
  const ta = await getTranslations({ locale, namespace: 'App' });
  const [stats, activity] = await Promise.all([
    getAdminStats(),
    adminListActivity({ pageSize: 6 }),
  ]);

  const cards = [
    { href: '/admin/leads?status=NEW', label: t('newLeads'), value: stats.leads.new },
    { href: '/admin/leads', label: t('totalLeads'), value: stats.leads.total },
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
