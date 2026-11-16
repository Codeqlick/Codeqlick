import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { CloudStatusSubscriberList, CloudStatusSubscriberStatus } from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import { subscribersHref, SUBSCRIBER_FILTERS } from '@/lib/cloud-subscribers';
import { deleteAllSubscribersAction, deleteSubscriberAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  team: string;
  enabled: boolean;
  list: CloudStatusSubscriberList;
  status: CloudStatusSubscriberStatus | undefined;
};

const TONES = { ACTIVE: 'success', PENDING: 'info', UNSUBSCRIBED: 'neutral' } as const;

/**
 * "Email subscriptions" of the status page, for its ADMINs and OWNERs (architecture 4.13,
 * decision 105): the counts against the plan's cap, the list with masked addresses, deleting one
 * or all of them, and who is responsible for them.
 */
export async function SubscribersSection({ locale, team, enabled, list, status }: Props) {
  const t = await getTranslations({ locale, namespace: 'Cloud.subscribers' });
  const { counts, items } = list;
  const used = counts.active + counts.pending;
  const base = `/cloud/console/${team}/status-page`;

  return (
    <section className={`${styles.card} ${styles.form}`} aria-labelledby="subscribers-title">
      <h2 id="subscribers-title" className={styles.cardTitle}>
        {t('title')}
      </h2>
      <p className={styles.muted}>{enabled ? t('on') : t('off')}</p>
      <p className={styles.small}>
        {t('counts', {
          active: counts.active,
          pending: counts.pending,
          unsubscribed: counts.unsubscribed,
        })}{' '}
        · {t('ofCap', { used, limit: list.limit })}
      </p>
      <nav className={styles.actions} aria-label={t('filter')}>
        {SUBSCRIBER_FILTERS.map((filter) => (
          <Link
            key={filter ?? 'all'}
            href={subscribersHref(base, filter, 1)}
            aria-current={filter === status ? 'page' : undefined}
            className={styles.small}
          >
            {filter ? t(`statuses.${filter}`) : t('all')}
          </Link>
        ))}
      </nav>
      {items.items.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <ul className={styles.list}>
          {items.items.map((subscriber) => (
            <li key={subscriber.id} className={styles.rowTitle}>
              <span>{subscriber.email}</span>
              <Badge tone={TONES[subscriber.status]}>{t(`statuses.${subscriber.status}`)}</Badge>
              <span className={styles.small}>
                {subscriber.locale.toUpperCase()} · {formatWhen(subscriber.createdAt, locale)}
              </span>
              <ActionForm action={deleteSubscriberAction.bind(null, locale, team, subscriber.id)}>
                <SubmitButton size="sm" variant="ghost" pendingLabel={t('deleting')}>
                  {t('delete')}
                  <span className="visually-hidden"> — {subscriber.email}</span>
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      {items.totalPages > 1 ? (
        <p className={styles.small}>
          {items.page > 1 ? (
            <Link href={subscribersHref(base, status, items.page - 1)}>{t('previous')}</Link>
          ) : null}{' '}
          {t('page', { page: items.page, totalPages: items.totalPages })}{' '}
          {items.page < items.totalPages ? (
            <Link href={subscribersHref(base, status, items.page + 1)}>{t('next')}</Link>
          ) : null}
        </p>
      ) : null}
      {counts.active + counts.pending + counts.unsubscribed > 0 ? (
        <details>
          <summary className={styles.small}>{t('deleteAll')}</summary>
          <ActionForm
            action={deleteAllSubscribersAction.bind(null, locale, team)}
            className={styles.form}
          >
            <FormCheckbox name="confirm" label={t('deleteAllConfirm')} />
            <div className={styles.actions}>
              <SubmitButton size="sm" variant="danger" pendingLabel={t('deleting')}>
                {t('deleteAll')}
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
      <p className={styles.small}>{t('responsibility')}</p>
    </section>
  );
}
