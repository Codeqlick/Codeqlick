import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  adminListSecurityChecks,
  SECURITY_CHECK_RUN_STATUSES,
  type SecurityCheckRunStatus,
} from '@/lib/api/security-checks';
import { firstParam, formatDateTime, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TONES: Record<SecurityCheckRunStatus, BadgeTone> = {
  PENDING: 'warning',
  DONE: 'success',
  FAILED: 'danger',
};

/** The free Security checks asked for (architecture 4.19): newest first, with their leads. */
export default async function AdminSecurityChecksPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.securityChecks' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const query = await searchParams;
  const rawStatus = firstParam(query.status);
  const status = SECURITY_CHECK_RUN_STATUSES.find((value) => value === rawStatus);
  const checks = await adminListSecurityChecks({ status, page: parsePage(query.page) });

  return (
    <>
      <PageHeader title={t('title')} />

      <FilterBar>
        <Select
          name="status"
          label={t('status')}
          placeholder={tc('all')}
          options={SECURITY_CHECK_RUN_STATUSES.map((value) => ({
            value,
            label: t(`statuses.${value}`),
          }))}
          defaultValue={status ?? ''}
        />
        <button type="submit" className={buttonClassName({ variant: 'outline' })}>
          {tc('filter')}
        </button>
      </FilterBar>

      {checks.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.tableCompact} ${styles.listTable}`}>
              <thead>
                <tr>
                  <th scope="col">{t('domain')}</th>
                  <th scope="col">{t('grade')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('requested')}</th>
                  <th scope="col">{t('links')}</th>
                </tr>
              </thead>
              <tbody>
                {checks.items.map((check) => (
                  <tr key={check.id}>
                    <th scope="row">
                      {check.domain}
                      <span className={styles.sub}>
                        {check.name ? `${check.name} · ` : ''}
                        {check.email}
                      </span>
                    </th>
                    <td data-label={t('grade')}>
                      {check.grade ? `${check.grade} · ${check.score}/100` : tc('none')}
                    </td>
                    <td data-label={t('status')} data-badge>
                      <Badge tone={TONES[check.status]}>{t(`statuses.${check.status}`)}</Badge>
                    </td>
                    <td data-label={t('requested')}>{formatDateTime(check.createdAt, locale)}</td>
                    <td data-label={t('links')}>
                      <Link href={`/security-check/${check.id}`} target="_blank">
                        {t('report')}
                      </Link>
                      {check.leadId ? (
                        <>
                          {' · '}
                          <Link href={`/admin/leads/${check.leadId}`}>{t('lead')}</Link>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={checks.page}
            totalPages={checks.totalPages}
            pathname="/admin/security-checks"
            query={{ status }}
          />
        </>
      )}
    </>
  );
}
