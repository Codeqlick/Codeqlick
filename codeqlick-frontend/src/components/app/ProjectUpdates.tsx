import { getTranslations } from 'next-intl/server';
import { Markdown } from '@/components/markdown/Markdown';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectUpdate } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import styles from './app.module.css';

/** Progress updates of a client project, newest first (as the API returns them). */
export async function ProjectUpdates({
  updates,
  locale,
  empty,
}: {
  updates: ProjectUpdate[];
  locale: AppLocale;
  empty: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Portal' });
  if (updates.length === 0) return <p className={styles.muted}>{empty}</p>;

  return (
    <ol className={styles.updates}>
      {updates.map((update) => (
        <li key={update.id} className={styles.update}>
          <h3 className={styles.updateTitle}>{update.title}</h3>
          <p className={styles.updateMeta}>
            {t('postedBy', {
              author: update.author.name,
              date: formatDateTime(update.createdAt, locale),
            })}
          </p>
          <Markdown compact>{update.body}</Markdown>
        </li>
      ))}
    </ol>
  );
}
