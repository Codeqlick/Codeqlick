import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SavedReplyPicker } from '@/components/app/SavedReplyPicker';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/app/StatusBadges';
import { TicketFiles } from '@/components/app/TicketFiles';
import { TicketThread } from '@/components/app/TicketThread';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminListSavedReplies } from '@/lib/api/saved-replies';
import { adminGetTicket } from '@/lib/api/support';
import { TICKET_PRIORITIES, TICKET_STATUSES, type TicketDetail } from '@/lib/api/types';
import { firstParam, formatDateTime } from '@/lib/format';
import {
  adminDeleteTicketFileAction,
  adminReplyToTicketAction,
  adminUpdateTicketAction,
} from '../actions';

export default async function AdminTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ files?: string | string[] }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Support' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tsr = await getTranslations({ locale, namespace: 'Admin.savedReplies' });
  // Optional: the reply box works without them.
  const savedReplies = await adminListSavedReplies().catch(() => []);

  let ticket: TicketDetail;
  try {
    ticket = await adminGetTicket(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const statusOptions = TICKET_STATUSES.map((value) => ({
    value,
    label: t(`statuses.${value}`),
  }));

  return (
    <div className={styles.stack}>
      <PageHeader
        title={`#${ticket.number} ${ticket.title}`}
        back={{ href: '/admin/support', label: t('back') }}
      />

      <section className={styles.panel}>
        <dl className={styles.facts}>
          <div>
            <dt>{t('client')}</dt>
            <dd>
              <Link href={`/admin/users/${ticket.client.id}`}>{ticket.client.name}</Link>
              <span className={styles.sub}>{ticket.client.email}</span>
            </dd>
          </div>
          <div>
            <dt>{t('status')}</dt>
            <dd>
              <TicketStatusBadge status={ticket.status} label={t(`statuses.${ticket.status}`)} />
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
          <div>
            <dt>{t('project')}</dt>
            <dd>
              {ticket.project ? (
                <Link href={`/admin/projects/${ticket.project.id}`}>{ticket.project.name}</Link>
              ) : (
                tc('none')
              )}
            </dd>
          </div>
          <div>
            <dt>{t('opened')}</dt>
            <dd>{formatDateTime(ticket.createdAt, locale)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.panel} id="reply" aria-labelledby="thread-heading">
        <h2 id="thread-heading" className={styles.panelTitle}>
          {t('conversation')}
        </h2>
        <div className={styles.stack}>
          <TicketThread messages={ticket.messages} locale={locale} label={t('conversation')} />
          {/* Keyed by the message count: a sent reply empties the box. */}
          <ActionForm
            key={ticket.messages.length}
            action={adminReplyToTicketAction.bind(null, locale, ticket.id)}
            className={styles.form}
          >
            <SavedReplyPicker
              target="body"
              replies={savedReplies}
              values={{ name: ticket.client.name, project: ticket.project?.name }}
              label={tsr('insert')}
              placeholder={tsr('insertPlaceholder')}
            />
            <FormTextarea
              name="body"
              label={t('replyLabel')}
              hint={t('adminReplyHint', { email: ticket.client.email })}
              rows={6}
              required
            />
            <FormSelect
              name="status"
              label={t('statusAfterReply')}
              options={statusOptions}
              defaultValue="WAITING_CLIENT"
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('sending')}>{t('reply')}</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </section>

      <TicketFiles
        ticket={ticket}
        locale={locale}
        from="admin"
        uploadResult={firstParam((await searchParams).files)}
        deleteAction={(fileId) => adminDeleteTicketFileAction.bind(null, locale, ticket.id, fileId)}
      />

      <section className={styles.panel}>
        <ActionForm
          key={`${ticket.status}-${ticket.priority}`}
          action={adminUpdateTicketAction.bind(null, locale, ticket.id)}
          className={styles.form}
        >
          <div className={styles.row}>
            <FormSelect
              name="status"
              label={t('status')}
              hint={t('statusHint')}
              options={statusOptions}
              defaultValue={ticket.status}
            />
            <FormSelect
              name="priority"
              label={t('priority')}
              options={TICKET_PRIORITIES.map((value) => ({
                value,
                label: t(`priorities.${value}`),
              }))}
              defaultValue={ticket.priority}
            />
          </div>
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
