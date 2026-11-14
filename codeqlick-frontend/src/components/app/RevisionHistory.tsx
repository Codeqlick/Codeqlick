import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import type { ContentRevision } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import styles from './app.module.css';

/**
 * "History" panel of a post's or case study's edit page (decision 72): each earlier version's
 * date and author, with a link to compare it with the current content and restore it.
 */
export async function RevisionHistory({
  locale,
  revisions,
  basePath,
}: {
  locale: AppLocale;
  revisions: ContentRevision[];
  /** `/admin/posts/<id>/revisions` or `/admin/portfolio/<id>/revisions`. */
  basePath: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.revisions' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  return (
    <section className={styles.panel} aria-labelledby="revision-history">
      <h2 id="revision-history" className={styles.panelTitle}>
        {t('history')}
      </h2>
      {revisions.length === 0 ? (
        <p className={styles.muted}>{t('historyEmpty')}</p>
      ) : (
        <ul className={styles.simpleList}>
          {revisions.map((revision) => {
            const entry = t('entry', {
              date: formatDateTime(revision.createdAt, locale),
              author: revision.author?.name ?? tc('none'),
            });
            return (
              <li key={revision.id}>
                <span>{entry}</span>
                <Link href={`${basePath}/${revision.id}`} aria-label={`${tc('view')}: ${entry}`}>
                  {tc('view')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
