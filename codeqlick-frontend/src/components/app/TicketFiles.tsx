import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import type { AppLocale } from '@/i18n/routing';
import { MAX_TICKET_FILE_BYTES } from '@/lib/api/support';
import type { TicketDetail } from '@/lib/api/types';
import type { FormAction } from './ActionForm';
import { ProjectFileUpload } from './ProjectFileUpload';
import { ProjectFiles } from './ProjectFiles';
import styles from './app.module.css';

/** Result of an upload made without JavaScript (the route handler redirects back with it). */
const UPLOAD_RESULTS = {
  uploaded: { tone: 'success', key: 'fileUploaded' },
  tooLarge: { tone: 'error', key: 'fileTooLarge' },
  failed: { tone: 'error', key: 'fileFailed' },
} as const;

/**
 * The files of a support request, with the upload form while it is open. Both sides use it: the
 * admin panel passes `deleteAction`.
 */
export async function TicketFiles({
  ticket,
  locale,
  from,
  uploadResult,
  deleteAction,
}: {
  ticket: TicketDetail;
  locale: AppLocale;
  /** Which page a browser without JavaScript returns to after uploading. */
  from: 'portal' | 'admin';
  /** The `?files=` query parameter. */
  uploadResult?: string;
  deleteAction?: (fileId: string) => FormAction;
}) {
  const t = await getTranslations({ locale, namespace: 'Support' });
  const result =
    uploadResult && Object.hasOwn(UPLOAD_RESULTS, uploadResult)
      ? UPLOAD_RESULTS[uploadResult as keyof typeof UPLOAD_RESULTS]
      : undefined;
  const base = `/${locale}/portal/support/${ticket.id}/files`;

  return (
    <section className={styles.panel} id="files" aria-labelledby="files-heading">
      <h2 id="files-heading" className={styles.panelTitle}>
        {t('filesTitle')}
      </h2>
      <div className={styles.stack}>
        {result ? <Alert tone={result.tone}>{t(result.key)}</Alert> : null}
        {ticket.status === 'CLOSED' ? null : (
          <ProjectFileUpload
            action={from === 'admin' ? `${base}?from=admin` : base}
            maxBytes={MAX_TICKET_FILE_BYTES}
            labels={{
              choose: t('chooseFile'),
              upload: t('uploadFile'),
              uploading: t('uploadingFile', { percent: '{percent}' }),
              hint: t('fileHint'),
              uploaded: t('fileUploaded'),
              tooLarge: t('fileTooLarge'),
              failed: t('fileFailed'),
              signedOut: t('fileSignedOut'),
            }}
          />
        )}
        <ProjectFiles
          fileHref={(fileId) => `${base}/${fileId}`}
          files={ticket.files}
          locale={locale}
          empty={t('noFiles')}
          deleteAction={deleteAction}
        />
      </div>
    </section>
  );
}
