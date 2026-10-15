import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { ProposalStatusBadge } from '@/components/app/StatusBadges';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listMyProposals } from '@/lib/api/proposals';
import { formatDate, formatMoney, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PortalProposalsPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Proposals' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const proposals = await listMyProposals({ page: parsePage((await searchParams).page) });

  return (
    <>
      <PageHeader title={t('title')} lead={t('lead')} />
      {proposals.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('proposal')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('total')}</th>
                  <th scope="col">{t('validUntil')}</th>
                </tr>
              </thead>
              <tbody>
                {proposals.items.map((proposal) => (
                  <tr key={proposal.id}>
                    <th scope="row">
                      <Link href={`/portal/proposals/${proposal.id}`}>{proposal.title}</Link>
                      <span className={styles.sub}>
                        #{proposal.number}
                        {proposal.project ? ` · ${proposal.project.name}` : ''}
                      </span>
                    </th>
                    <td>
                      <ProposalStatusBadge
                        status={proposal.status}
                        expired={proposal.expired}
                        label={
                          proposal.expired
                            ? t('expired')
                            : proposal.status === 'SENT'
                              ? t('waitingYou')
                              : t(`statuses.${proposal.status}`)
                        }
                      />
                    </td>
                    <td>{formatMoney(proposal.total, proposal.currency, locale)}</td>
                    <td>
                      {proposal.validUntil ? formatDate(proposal.validUntil, locale) : tc('none')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={proposals.page}
            totalPages={proposals.totalPages}
            pathname="/portal/proposals"
          />
        </>
      )}
    </>
  );
}
