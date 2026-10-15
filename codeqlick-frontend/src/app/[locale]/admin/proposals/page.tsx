import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { ProposalStatusBadge } from '@/components/app/StatusBadges';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListProposals } from '@/lib/api/proposals';
import { PROPOSAL_STATUSES, type ProposalStatus } from '@/lib/api/types';
import { firstParam, formatDateTime, formatMoney, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProposalsPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.proposals' });
  const ts = await getTranslations({ locale, namespace: 'Proposals.statuses' });
  const tp = await getTranslations({ locale, namespace: 'Proposals' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const query = await searchParams;
  const rawStatus = firstParam(query.status);
  const status = PROPOSAL_STATUSES.find((value) => value === rawStatus) as
    ProposalStatus | undefined;
  const proposals = await adminListProposals({ status, page: parsePage(query.page) });

  return (
    <>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/admin/proposals/new" size="sm">
            {t('new')}
          </Button>
        }
      />

      <form method="get" className={styles.filters}>
        <Select
          name="status"
          label={t('status')}
          placeholder={tc('all')}
          options={PROPOSAL_STATUSES.map((value) => ({ value, label: ts(value) }))}
          defaultValue={status ?? ''}
        />
        <button type="submit" className={buttonClassName({ variant: 'outline' })}>
          {tc('filter')}
        </button>
      </form>

      {proposals.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('proposal')}</th>
                  <th scope="col">{t('client')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{tp('total')}</th>
                  <th scope="col">{t('updated')}</th>
                </tr>
              </thead>
              <tbody>
                {proposals.items.map((proposal) => (
                  <tr key={proposal.id}>
                    <th scope="row">
                      <Link href={`/admin/proposals/${proposal.id}`}>{proposal.title}</Link>
                      <span className={styles.sub}>
                        #{proposal.number}
                        {proposal.project ? ` · ${proposal.project.name}` : ''}
                      </span>
                    </th>
                    <td>{proposal.client.name}</td>
                    <td>
                      <ProposalStatusBadge
                        status={proposal.status}
                        expired={proposal.expired}
                        label={proposal.expired ? tp('expired') : ts(proposal.status)}
                      />
                    </td>
                    <td>{formatMoney(proposal.total, proposal.currency, locale)}</td>
                    <td>{formatDateTime(proposal.updatedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={proposals.page}
            totalPages={proposals.totalPages}
            pathname="/admin/proposals"
            query={{ status }}
          />
        </>
      )}
    </>
  );
}
