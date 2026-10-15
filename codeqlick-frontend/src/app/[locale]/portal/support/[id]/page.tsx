import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/app/StatusBadges';
import { TicketThread } from '@/components/app/TicketThread';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMyTicket } from '@/lib/api/support';
import type { TicketDetail } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { closeTicketAction, replyToTicketAction } from '../actions';

export default async function PortalTicketPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Support' });

  let ticket: TicketDetail;
  try {
    ticket = await getMyTicket(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const closed = ticket.status === 'CLOSED';

  return (
    <div className={styles.stack}>
      <PageHeader title={ticket.title} back={{ href: '/portal/support', label: t('back') }} />

      <section className={styles.panel}>
        <dl className={styles.facts}>
          <div>
            <dt>{t('number')}</dt>
            <dd>#{ticket.number}</dd>
          </div>
          <div>
            <dt>{t('status')}</dt>
            <dd>
              <TicketStatusBadge
                status={ticket.status}
                label={
                  ticket.status === 'WAITING_CLIENT'
                    ? t('waitingYou')
                    : t(`statuses.${ticket.status}`)
                }
              />
            </dd>
          </div>
          <div>
            <dt>{t('type')}</dt>
            <dd>{t(`types.${ticket.type}`)}</dd>
          </div>
          <div>
            <dt>{t('priority')}</dt>
            <dd>
              <TicketPriorityBadge
                priority={ticket.priority}
                label={t(`priorities.${ticket.priority}`)}
              />
            </dd>
          </div>
          {ticket.project ? (
            <div>
              <dt>{t('project')}</dt>
              <dd>
                <Link href={`/portal/projects/${ticket.project.id}`}>{ticket.project.name}</Link>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t('opened')}</dt>
            <dd>{formatDateTime(ticket.createdAt, locale)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.panel} aria-labelledby="thread-heading">
        <h2 id="thread-heading" className={styles.panelTitle}>
          {t('conversation')}
        </h2>
        <div className={styles.stack}>
          <TicketThread messages={ticket.messages} locale={locale} label={t('conversation')} />
          {closed ? (
            <p className={styles.muted}>{t('closedNotice')}</p>
          ) : (
            <ActionForm
              key={ticket.messages.length}
              action={replyToTicketAction.bind(null, locale, ticket.id)}
              className={styles.form}
            >
              <FormTextarea
                name="body"
                label={t('replyLabel')}
                hint={ticket.status === 'RESOLVED' ? t('reopenHint') : undefined}
                rows={5}
                required
              />
              <div className={styles.actions}>
                <SubmitButton pendingLabel={t('sending')}>{t('reply')}</SubmitButton>
              </div>
            </ActionForm>
          )}
        </div>
      </section>

      {closed ? null : (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('closeTitle')}</h2>
          <ActionForm
            action={closeTicketAction.bind(null, locale, ticket.id)}
            className={styles.form}
          >
            <p className={styles.muted}>{t('closeBody')}</p>
            <div>
              <SubmitButton variant="outline" pendingLabel={t('closing')}>
                {t('close')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
