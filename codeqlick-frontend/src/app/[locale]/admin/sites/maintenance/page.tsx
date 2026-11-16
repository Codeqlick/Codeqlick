import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListMaintenance } from '@/lib/api/maintenance';
import { formatDate, formatMoney } from '@/lib/format';
import { MAINTENANCE_TONES, maintenanceState } from '@/lib/maintenance';

/** Every project whose maintenance plan is or was on, with the MRR (decision 110). */
export default async function AdminMaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Maintenance' });
  const ts = await getTranslations({ locale, namespace: 'Admin.sites' });
  const list = await adminListMaintenance();
  const cards = [
    {
      label: t('admin.mrr'),
      value:
        list.mrrCents === null ? t('admin.mrrUnknown') : formatMoney(list.mrrCents, 'EUR', locale),
    },
    { label: t('admin.paidCount'), value: String(list.paidCount) },
    { label: t('admin.includedCount'), value: String(list.includedCount) },
  ];

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('admin.listTitle')}
        lead={t('admin.listLead')}
        back={{ href: '/admin/sites', label: ts('title') }}
      />
      <ul className={styles.stats}>
        {cards.map((card) => (
          <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
            <span className={styles.statValue}>{card.value}</span>
            <span className={styles.statLabel}>{card.label}</span>
          </li>
        ))}
      </ul>
      {list.items.length === 0 ? (
        <EmptyState title={t('admin.emptyTitle')} body={t('admin.emptyBody')} />
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.listTable}`}>
            <thead>
              <tr>
                <th scope="col">{t('admin.project')}</th>
                <th scope="col">{t('admin.client')}</th>
                <th scope="col">{t('admin.state')}</th>
                <th scope="col">{t('admin.since')}</th>
                <th scope="col">{t('admin.periodEnd')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => {
                const state = maintenanceState(item);
                return (
                  <tr key={item.projectId}>
                    <th scope="row">
                      <Link href={`/admin/projects/${item.projectId}#maintenance`}>
                        {item.projectName}
                      </Link>
                      {item.includedReason ? (
                        <span className={styles.sub}>{item.includedReason}</span>
                      ) : null}
                    </th>
                    <td data-label={t('admin.client')}>{item.client.name}</td>
                    <td data-label={t('admin.state')} data-wide>
                      <Badge tone={MAINTENANCE_TONES[state]}>{t(`statusLabels.${state}`)}</Badge>
                    </td>
                    <td data-label={t('admin.since')}>
                      {item.since ? formatDate(item.since, locale) : '—'}
                    </td>
                    <td data-label={t('admin.periodEnd')}>
                      {item.periodEnd && !item.included ? formatDate(item.periodEnd, locale) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
