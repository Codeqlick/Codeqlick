import { getTranslations } from 'next-intl/server';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectUpdate } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { ActionForm, FormTextarea, type FormAction } from './ActionForm';
import styles from './app.module.css';

/**
 * Progress updates of a client project, newest first (as the API returns them), each with its
 * approval state and comment thread. `commentAction` adds a comment form under each update;
 * `approveAction` (the client, in the portal) adds the approve button where it is asked for.
 */
export async function ProjectUpdates({
  updates,
  locale,
  empty,
  commentAction,
  approveAction,
}: {
  updates: ProjectUpdate[];
  locale: AppLocale;
  empty: string;
  commentAction?: (updateId: string) => FormAction;
  approveAction?: (updateId: string) => FormAction;
}) {
  const t = await getTranslations({ locale, namespace: 'Portal' });
  if (updates.length === 0) return <p className={styles.muted}>{empty}</p>;

  return (
    <ol className={styles.updates}>
      {updates.map((update) => (
        <li key={update.id} id={`update-${update.id}`} className={styles.update}>
          <h3 className={styles.updateTitle}>{update.title}</h3>
          <p className={styles.updateMeta}>
            {t('postedBy', {
              author: update.author.name,
              date: formatDateTime(update.createdAt, locale),
            })}
          </p>
          {update.approvalRequested ? (
            <p className={styles.approval}>
              {update.approvedAt ? (
                <Badge tone="success">
                  {t('approvedBy', {
                    name: update.approvedBy?.name ?? '—',
                    date: formatDateTime(update.approvedAt, locale),
                  })}
                </Badge>
              ) : (
                <Badge tone="warning">{t('approvalPending')}</Badge>
              )}
            </p>
          ) : null}
          <Markdown compact>{update.body}</Markdown>

          {approveAction && update.approvalRequested && !update.approvedAt ? (
            <ActionForm action={approveAction(update.id)} className={styles.approveBox}>
              <p className={styles.muted}>{t('approveHint')}</p>
              <div>
                <SubmitButton pendingLabel={t('approving')}>{t('approve')}</SubmitButton>
              </div>
            </ActionForm>
          ) : null}

          {update.comments.length > 0 || commentAction ? (
            <div className={styles.thread}>
              {update.comments.length > 0 ? (
                <ol className={styles.comments} aria-label={t('comments')}>
                  {update.comments.map((comment) => (
                    <li
                      key={comment.id}
                      className={`${styles.comment} ${comment.author.team ? styles.commentTeam : ''}`}
                    >
                      <p className={styles.commentMeta}>
                        <strong>{comment.author.name}</strong>
                        {comment.author.team ? <Badge tone="brand">Codeqlick</Badge> : null}
                        <span>{formatDateTime(comment.createdAt, locale)}</span>
                      </p>
                      <p className={styles.commentBody}>{comment.body}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
              {commentAction ? (
                <details className={styles.commentForm}>
                  <summary>{t('writeComment')}</summary>
                  <ActionForm action={commentAction(update.id)} className={styles.form}>
                    <FormTextarea
                      id={`comment-${update.id}`}
                      name="body"
                      label={t('commentLabel')}
                      rows={3}
                      required
                    />
                    <div className={styles.actions}>
                      <SubmitButton size="sm" pendingLabel={t('sending')}>
                        {t('sendComment')}
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
