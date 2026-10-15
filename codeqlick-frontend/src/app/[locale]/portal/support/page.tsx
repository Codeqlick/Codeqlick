import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/app/StatusBadges';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listMyTickets } from '@/lib/api/support';
import { formatDateTime, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PortalSupportPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Support' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tickets = await listMyTickets({ page: parsePage((await searchParams).page) });

  return (
    <>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/portal/support/new" size="sm">
            {t('new')}
          </Button>
        }
      />
      {tickets.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('request')}</th>
                  <th scope="col">{t('project')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('priority')}</th>
                  <th scope="col">{t('updated')}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.items.map((ticket) => (
                  <tr key={ticket.id}>
                    <th scope="row">
                      <Link href={`/portal/support/${ticket.id}`}>{ticket.title}</Link>
                      <span className={styles.sub}>
                        #{ticket.number} · {t(`types.${ticket.type}`)}
                      </span>
                    </th>
                    <td>{ticket.project?.name ?? tc('none')}</td>
                    <td>
                      <TicketStatusBadge
                        status={ticket.status}
                        label={
                          ticket.status === 'WAITING_CLIENT'
                            ? t('waitingYou')
                            : t(`statuses.${ticket.status}`)
                        }
                      />
                    </td>
                    <td>
                      <TicketPriorityBadge
                        priority={ticket.priority}
                        label={t(`priorities.${ticket.priority}`)}
                      />
                    </td>
                    <td>{formatDateTime(ticket.updatedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={tickets.page}
            totalPages={tickets.totalPages}
            pathname="/portal/support"
          />
        </>
      )}
    </>
  );
}
