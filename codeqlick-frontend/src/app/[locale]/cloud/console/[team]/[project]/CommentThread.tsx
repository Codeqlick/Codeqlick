import { useTranslations } from 'next-intl';
import { ActionForm, FormTextarea } from '@/components/app/ActionForm';
import { ConfirmForm } from '@/components/cloud/ConfirmForm';
import { Badge } from '@/components/ui/Badge';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { CloudCommentThread } from '@/lib/api/cloud';
import { canDeleteComment, formatWhen, viewportHint } from '@/lib/cloud';
import {
  deleteCommentAction,
  replyCommentAction,
  resolveCommentThreadAction,
} from '../../../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../cloud.module.css';
import { MentionPicker } from './MentionPicker';

type Props = {
  locale: AppLocale;
  path: string;
  projectId: string;
  thread: CloudCommentThread;
  /** The signed-in person (their own comments can be deleted). */
  meId: string | null;
  /** ADMIN or OWNER: deletes anyone's comment. */
  admin: boolean;
  /** Who can be mentioned: the team's members but the signed-in person. */
  members: { id: string; name: string }[];
  /** The console's route that opens the preview's comments page in a new tab. */
  commentRoute: string;
};

/**
 * One thread of the Comments tab (architecture 4.13 "Preview comments"): where it was pinned, its
 * comments as plain text, a reply box with the mention picker, Resolve or Reopen, Delete and "Open
 * on the preview" while the deployment exists.
 */
export function CommentThread({
  locale,
  path,
  projectId,
  thread,
  meId,
  admin,
  members,
  commentRoute,
}: Props) {
  const t = useTranslations('Cloud.comments');
  const device = viewportHint(thread.viewportWidth);
  const replyId = `reply-${thread.id}`;
  const openHref = thread.deploymentId
    ? `${commentRoute}?deployment=${encodeURIComponent(thread.deploymentId)}&path=${encodeURIComponent(thread.path)}`
    : null;
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="project" value={projectId} />
      <input type="hidden" name="path" value={path} />
    </>
  );
  return (
    <article className={appUi.card} aria-label={t('threadLabel', { path: thread.path })}>
      <p className={styles.rowTitle}>
        <span className={styles.mono}>{thread.deploymentShort}</span>
        <span className={`${styles.mono} ${styles.small}`}>{thread.path}</span>
        {device ? (
          <Badge tone="info">
            {t(`device.${device}`)}
            <span className="visually-hidden"> ({thread.viewportWidth} px)</span>
          </Badge>
        ) : null}
        {thread.resolvedAt ? (
          <Badge tone="success">{t('resolvedBadge')}</Badge>
        ) : (
          <Badge tone="brand">{t('openBadge')}</Badge>
        )}
      </p>
      {thread.resolvedAt ? (
        <p className={styles.small}>
          {thread.resolvedBy
            ? t('resolvedBy', {
                name: thread.resolvedBy.name,
                when: formatWhen(thread.resolvedAt, locale),
              })
            : t('resolvedAt', { when: formatWhen(thread.resolvedAt, locale) })}
        </p>
      ) : null}
      {thread.deploymentId ? null : <p className={styles.small}>{t('deploymentGone')}</p>}

      <ol className={styles.list}>
        {thread.comments.map((comment) => (
          <li key={comment.id} className={styles.row}>
            <div className={styles.rowMain}>
              <p className={styles.small}>
                <strong>{comment.author.name}</strong> ·{' '}
                <time dateTime={comment.createdAt}>{formatWhen(comment.createdAt, locale)}</time>
              </p>
              {/* Plain text only: React escapes it; never rendered as HTML. */}
              <p className={styles.commentBody}>{comment.body}</p>
            </div>
            {canDeleteComment(comment.author.id, meId, admin) ? (
              <ConfirmForm action={deleteCommentAction} message={t('deleteConfirm')}>
                {hidden}
                <input type="hidden" name="thread" value={thread.id} />
                <input type="hidden" name="id" value={comment.id} />
                <SubmitButton size="sm" variant="ghost">
                  {t('delete')}
                  <span className="visually-hidden"> — {comment.author.name}</span>
                </SubmitButton>
              </ConfirmForm>
            ) : null}
          </li>
        ))}
      </ol>

      <ActionForm
        action={replyCommentAction.bind(null, locale, path, projectId, thread.id)}
        className={styles.form}
      >
        <FormTextarea
          id={replyId}
          name="body"
          label={t('reply')}
          rows={2}
          maxLength={2000}
          required
        />
        <MentionPicker members={members} textareaId={replyId} legend={t('mention')} />
        <div className={appUi.actions}>
          <SubmitButton size="sm" pendingLabel={t('sending')}>
            {t('send')}
          </SubmitButton>
        </div>
      </ActionForm>

      <div className={appUi.actions}>
        <form action={resolveCommentThreadAction}>
          {hidden}
          <input type="hidden" name="id" value={thread.id} />
          <input type="hidden" name="resolved" value={thread.resolvedAt ? '0' : '1'} />
          <SubmitButton size="sm" variant="outline">
            {thread.resolvedAt ? t('reopen') : t('resolve')}
          </SubmitButton>
        </form>
        {openHref ? (
          <a
            href={openHref}
            target="_blank"
            rel="noreferrer"
            className={buttonClassName({ variant: 'ghost', size: 'sm' })}
          >
            {t('openOnPreview')}
          </a>
        ) : null}
      </div>
    </article>
  );
}
