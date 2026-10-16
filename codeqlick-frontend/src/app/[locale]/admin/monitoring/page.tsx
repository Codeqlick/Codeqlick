import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SiteStatus } from '@/components/app/SiteStatus';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListMonitors } from '@/lib/api/monitoring';

/** Every monitored client site, down ones first. */
export default async function AdminMonitoringPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Monitoring' });
  const order = { DOWN: 0, UNKNOWN: 1, UP: 2 } as const;
  const monitors = (await adminListMonitors()).toSorted(
    (a, b) => Number(!a.enabled) - Number(!b.enabled) || order[a.status] - order[b.status],
  );

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />
      {monitors.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        monitors.map((monitor) => (
          <section key={monitor.projectId} className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Link href={`/admin/projects/${monitor.projectId}#monitor`}>{monitor.project}</Link>
            </h2>
            <p className={styles.muted}>
              {monitor.client}
              {monitor.url ? ` · ${monitor.url}` : ''}
              {monitor.enabled ? '' : ` · ${t('paused')}`}
            </p>
            <SiteStatus monitor={monitor} locale={locale} />
          </section>
        ))
      )}
    </div>
  );
}
