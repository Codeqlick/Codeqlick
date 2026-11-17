import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getCloudMe, listCloudMembers, type CloudCommentThread } from '@/lib/api/cloud';
import { COMMENT_STATUSES, type CommentStatus } from '@/lib/cloud';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../cloud.module.css';
import { CommentThread } from './CommentThread';

type Props = {
  locale: AppLocale;
  teamSlug: string;
  projectId: string;
  path: string;
  base: string;
  admin: boolean;
  status: CommentStatus;
  /** The threads of `status` (the page loads them for the tab's open count); null: failed. */
  threads: CloudCommentThread[] | null;
  /** The console's route that opens a deployment's comments page. */
  commentRoute: string;
};

/**
 * The project's comments inbox (architecture 4.13 "Preview comments", decision 111): the threads
 * left on its previews, filtered by open / resolved / all.
 */
export async function CommentsTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud.comments' });
  const [me, members] = await Promise.all([
    getCloudMe().catch(() => null),
    listCloudMembers(props.teamSlug).catch(() => null),
  ]);
  const meId = me?.user.id ?? null;
  const mentionable = (members?.items ?? [])
    .filter((member) => member.userId !== meId)
    .map((member) => ({ id: member.userId, name: member.name }));

  return (
    <section className={styles.landing} aria-labelledby="comments-title">
      <div>
        <h2 id="comments-title" className={appUi.sectionTitle}>
          {t('title')}
        </h2>
        <p className={styles.muted}>{t('lead')}</p>
      </div>
      <nav className={styles.tabs} aria-label={t('filter')}>
        {COMMENT_STATUSES.map((status) => (
          <Link
            key={status}
            href={`${props.base}?tab=comments${status === 'open' ? '' : `&status=${status}`}`}
            className={styles.tab}
            aria-current={props.status === status ? 'page' : undefined}
          >
            {t(`status.${status}`)}
          </Link>
        ))}
      </nav>
      {props.threads === null ? (
        <p className={styles.muted}>{t('loadError')}</p>
      ) : props.threads.length === 0 ? (
        <p className={styles.muted}>{t(`empty.${props.status}`)}</p>
      ) : (
        props.threads.map((thread) => (
          <CommentThread
            key={thread.id}
            locale={props.locale}
            path={props.path}
            projectId={props.projectId}
            thread={thread}
            meId={meId}
            admin={props.admin}
            members={mentionable}
            commentRoute={props.commentRoute}
          />
        ))
      )}
    </section>
  );
}
