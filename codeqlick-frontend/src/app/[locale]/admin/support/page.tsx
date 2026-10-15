import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/app/StatusBadges';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListTickets } from '@/lib/api/support';
import { TICKET_STATUSES, type TicketStatus } from '@/lib/api/types';
import { firstParam, formatDateTime, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** `active` (the default): every request not resolved or closed yet. */
const ACTIVE = 'active';

export default async function AdminSupportPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Support' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const query = await searchParams;
  const rawStatus = firstParam(query.status) ?? ACTIVE;
  const status = TICKET_STATUSES.find((value) => value === rawStatus) as TicketStatus | undefined;
  const active = rawStatus === ACTIVE;
  const tickets = await adminListTickets({ status, active, page: parsePage(query.page) });

  return (
    <>
      <PageHeader title={t('title')} lead={t('adminLead')} />

      <form method="get" className={styles.filters}>
        <Select
          name="status"
          label={t('status')}
          placeholder={tc('all')}
          options={[
            { value: ACTIVE, label: t('activeFilter') },
            ...TICKET_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) })),
          ]}
          defaultValue={status ?? (active ? ACTIVE : '')}
        />
        <button type="submit" className={buttonClassName({ variant: 'outline' })}>
          {tc('filter')}
        </button>
      </form>

      {tickets.items.length === 0 ? (
        <EmptyState title={t('adminEmptyTitle')} body={t('adminEmptyBody')} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('request')}</th>
                  <th scope="col">{t('client')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('priority')}</th>
                  <th scope="col">{t('updated')}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.items.map((ticket) => (
                  <tr key={ticket.id}>
                    <th scope="row">
                      <Link href={`/admin/support/${ticket.id}`}>{ticket.title}</Link>
                      <span className={styles.sub}>
                        #{ticket.number} · {t(`types.${ticket.type}`)}
                        {ticket.project ? ` · ${ticket.project.name}` : ''}
                      </span>
                    </th>
                    <td>{ticket.client.name}</td>
                    <td>
                      <TicketStatusBadge
                        status={ticket.status}
                        label={t(`statuses.${ticket.status}`)}
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
            pathname="/admin/support"
            query={{ status: rawStatus }}
          />
        </>
      )}
    </>
  );
}
