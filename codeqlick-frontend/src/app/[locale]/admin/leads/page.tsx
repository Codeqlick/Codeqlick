import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { LeadStatusBadge } from '@/components/app/StatusBadges';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListLeads } from '@/lib/api/leads';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/api/types';
import { firstParam, formatDateTime, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLeadsPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.leads' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const ts = await getTranslations({ locale, namespace: 'LeadStatuses' });

  const query = await searchParams;
  const rawStatus = firstParam(query.status);
  const status = LEAD_STATUSES.find((value) => value === rawStatus) as LeadStatus | undefined;
  const q = firstParam(query.q)?.trim() || undefined;
  const leads = await adminListLeads({ status, q, page: parsePage(query.page) });
  const exportQuery = new URLSearchParams(
    Object.entries({ status, q }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          // A plain link: the browser downloads the file, the current filters go with it.
          <a
            href={`/${locale}/admin/leads/export${exportQuery ? `?${exportQuery}` : ''}`}
            className={buttonClassName({ variant: 'outline', size: 'sm' })}
            download
          >
            {t('exportCsv')}
          </a>
        }
      />

      <form method="get" className={styles.filters}>
        <Select
          name="status"
          label={t('status')}
          placeholder={tc('all')}
          options={LEAD_STATUSES.map((value) => ({ value, label: ts(value) }))}
          defaultValue={status ?? ''}
        />
        <Input
          name="q"
          type="search"
          label={t('search')}
          placeholder={t('searchPlaceholder')}
          defaultValue={q}
        />
        <button type="submit" className={buttonClassName({ variant: 'outline' })}>
          {tc('filter')}
        </button>
      </form>

      {leads.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('name')}</th>
                  <th scope="col">{t('company')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('received')}</th>
                </tr>
              </thead>
              <tbody>
                {leads.items.map((lead) => (
                  <tr key={lead.id}>
                    <th scope="row">
                      <Link href={`/admin/leads/${lead.id}`}>{lead.name}</Link>
                      <span className={styles.sub}>{lead.email}</span>
                    </th>
                    <td>{lead.company ?? tc('none')}</td>
                    <td>
                      <LeadStatusBadge status={lead.status} label={ts(lead.status)} />
                    </td>
                    <td>{formatDateTime(lead.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={leads.page}
            totalPages={leads.totalPages}
            pathname="/admin/leads"
            query={{ status, q }}
          />
        </>
      )}
    </>
  );
}
