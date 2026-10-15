import { getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectTask, TaskStatus } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { ActionForm, type FormAction } from './ActionForm';
import styles from './app.module.css';
import tasks from './ProjectTasks.module.css';

const TONES: Record<TaskStatus, BadgeTone> = {
  TODO: 'neutral',
  IN_PROGRESS: 'warning',
  DONE: 'success',
};

/** The next status a task moves to with its button. */
const NEXT: Record<TaskStatus, TaskStatus> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'TODO',
};

/**
 * A project's tasks, open ones first. The admin panel passes the actions: a button that moves each
 * task on (to do → in progress → done, or reopens it) and a delete button; `ticketHref` links the
 * request a task came from.
 */
export async function ProjectTasks({
  items,
  locale,
  empty,
  statusAction,
  deleteAction,
  ticketHref,
  doneLimit,
}: {
  items: ProjectTask[];
  locale: AppLocale;
  empty: string;
  statusAction?: (taskId: string, status: TaskStatus) => FormAction;
  deleteAction?: (taskId: string) => FormAction;
  ticketHref?: (ticketId: string) => string;
  /** Show only the latest N done tasks. */
  doneLimit?: number;
}) {
  const t = await getTranslations({ locale, namespace: 'Tasks' });
  const open = items.filter((task) => task.status !== 'DONE');
  const done = items.filter((task) => task.status === 'DONE');
  const shown = [...open, ...(doneLimit === undefined ? done : done.slice(0, doneLimit))];
  if (shown.length === 0) return <p className={styles.muted}>{empty}</p>;

  return (
    <ul className={tasks.list}>
      {shown.map((task) => (
        <li key={task.id} className={`${tasks.task} ${task.status === 'DONE' ? tasks.done : ''}`}>
          <div className={tasks.main}>
            <p className={tasks.title}>
              <Badge tone={TONES[task.status]}>{t(`statuses.${task.status}`)}</Badge>
              <span className={tasks.titleText}>{task.title}</span>
            </p>
            <p className={styles.muted}>
              {task.status === 'DONE' && task.doneAt
                ? t('doneOn', { date: formatDate(task.doneAt, locale) })
                : t('addedOn', { date: formatDate(task.createdAt, locale) })}
              {task.ticket ? (
                <>
                  {' · '}
                  {ticketHref ? (
                    <a href={ticketHref(task.ticket.id)}>
                      {t('requestRef', { number: task.ticket.number })}
                    </a>
                  ) : (
                    t('requestRef', { number: task.ticket.number })
                  )}
                </>
              ) : null}
            </p>
            {task.description ? <p className={tasks.description}>{task.description}</p> : null}
          </div>
          {statusAction || deleteAction ? (
            <div className={tasks.actions}>
              {statusAction ? (
                <ActionForm action={statusAction(task.id, NEXT[task.status])}>
                  <SubmitButton variant="outline" size="sm" pendingLabel={t('saving')}>
                    {t(`move.${task.status}`)}
                    <span className="visually-hidden"> — {task.title}</span>
                  </SubmitButton>
                </ActionForm>
              ) : null}
              {deleteAction ? (
                <ActionForm action={deleteAction(task.id)}>
                  <SubmitButton variant="ghost" size="sm" pendingLabel={t('deleting')}>
                    {t('delete')}
                    <span className="visually-hidden"> — {task.title}</span>
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
