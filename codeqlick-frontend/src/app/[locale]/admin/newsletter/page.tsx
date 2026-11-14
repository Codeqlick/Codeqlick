import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { resolveLocale } from '@/i18n/locale';
import { adminListNewsletter } from '@/lib/api/newsletter';
import {
  NEWSLETTER_STATUSES,
  type NewsletterStatus,
  type NewsletterSubscriberView,
} from '@/lib/api/types';
import { firstParam, formatDate, parsePage } from '@/lib/format';
import { deleteSubscriberAction } from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_TONES: Record<NewsletterStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  UNSUBSCRIBED: 'neutral',
};

/** The date that matters for the subscriber's status: when they confirmed or left. */
function statusDate(subscriber: NewsletterSubscriberView): string | null {
  if (subscriber.status === 'ACTIVE') return subscriber.confirmedAt;
  if (subscriber.status === 'UNSUBSCRIBED') return subscriber.unsubscribedAt;
  return null;
}

export default async function AdminNewsletterPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.newsletter' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const query = await searchParams;
  const rawStatus = firstParam(query.status);
  const status = NEWSLETTER_STATUSES.find((value) => value === rawStatus) as
    | NewsletterStatus
    | undefined;
  const q = firstParam(query.q)?.trim() || undefined;
  const list = await adminListNewsletter({ status, q, page: parsePage(query.page) });
  const cards = [
    { label: t('counts.active'), value: list.counts.active },
    { label: t('counts.pending'), value: list.counts.pending },
    { label: t('counts.unsubscribed'), value: list.counts.unsubscribed },
  ];

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />

      <ul className={styles.stats}>
        {cards.map((card) => (
          <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
            <span className={styles.statValue}>{card.value}</span>
            <span className={styles.statLabel}>{card.label}</span>
          </li>
        ))}
      </ul>

      <form method="get" className={styles.filters}>
        <Select
          name="status"
          label={t('status')}
          placeholder={tc('all')}
          options={NEWSLETTER_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))}
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

      {list.items.length === 0 ? (
        status || q ? (
          <EmptyState title={t('noMatchTitle')} body={t('noMatchBody')} />
        ) : (
          <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
        )
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.listTable}`}>
              <thead>
                <tr>
                  <th scope="col">{t('email')}</th>
                  <th scope="col">{t('language')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('signedUp')}</th>
                  <th scope="col">
                    <span className="visually-hidden">{tc('delete')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((subscriber) => {
                  const date = statusDate(subscriber);
                  return (
                    <tr key={subscriber.id}>
                      <th scope="row">{subscriber.email}</th>
                      <td data-label={t('language')}>{t(`languages.${subscriber.locale}`)}</td>
                      <td data-label={t('status')} data-wide>
                        <Badge tone={STATUS_TONES[subscriber.status]}>
                          {t(`statuses.${subscriber.status}`)}
                        </Badge>
                        {date ? (
                          <span className={styles.sub}>
                            {t(subscriber.status === 'ACTIVE' ? 'confirmedOn' : 'unsubscribedOn', {
                              date: formatDate(date, locale),
                            })}
                          </span>
                        ) : null}
                      </td>
                      <td data-label={t('signedUp')}>{formatDate(subscriber.createdAt, locale)}</td>
                      <td data-wide>
                        <ActionForm
                          action={deleteSubscriberAction.bind(null, locale, subscriber.id)}
                        >
                          <SubmitButton variant="danger" size="sm" pendingLabel={tc('deleting')}>
                            {tc('delete')}
                            <span className="visually-hidden"> {subscriber.email}</span>
                          </SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={list.page}
            totalPages={list.totalPages}
            pathname="/admin/newsletter"
            query={{ status, q }}
          />
        </>
      )}
    </div>
  );
}
