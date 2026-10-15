import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectFile } from '@/lib/api/types';
import { formatBytes, formatDateTime } from '@/lib/format';
import { ActionForm, FormCheckbox, type FormAction } from './ActionForm';
import styles from './app.module.css';

/**
 * Shared files (of a client project or a support request), each a download link to
 * `fileHref(id)`. The admin panel passes `deleteAction` to add a delete control per file.
 */
export async function ProjectFiles({
  fileHref,
  files,
  locale,
  empty,
  deleteAction,
}: {
  fileHref: (fileId: string) => string;
  files: ProjectFile[];
  locale: AppLocale;
  empty: string;
  deleteAction?: (fileId: string) => FormAction;
}) {
  const t = await getTranslations({ locale, namespace: 'Portal' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  if (files.length === 0) return <p className={styles.muted}>{empty}</p>;

  return (
    <ul className={styles.files}>
      {files.map((file) => (
        <li key={file.id} className={styles.fileRow}>
          <div className={styles.fileInfo}>
            {/* A route handler, not a page: plain link, and `download` keeps the page in place. */}
            <a href={fileHref(file.id)} download={file.name} className={styles.fileName}>
              {file.name}
            </a>
            <span className={styles.muted}>
              {t('fileMeta', {
                size: formatBytes(file.size, locale),
                date: formatDateTime(file.createdAt, locale),
              })}
            </span>
          </div>
          {deleteAction ? (
            <ActionForm action={deleteAction(file.id)} className={styles.fileDelete}>
              <FormCheckbox
                id={`confirm-file-${file.id}`}
                name="confirm"
                label={tc('confirmDelete')}
                required
              />
              <SubmitButton variant="danger" size="sm" pendingLabel={tc('deleting')}>
                {tc('delete')}
              </SubmitButton>
            </ActionForm>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
