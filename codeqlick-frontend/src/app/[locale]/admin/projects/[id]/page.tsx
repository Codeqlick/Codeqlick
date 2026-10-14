import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { ProjectFileUpload } from '@/components/app/ProjectFileUpload';
import { ProjectFiles } from '@/components/app/ProjectFiles';
import { ProjectUpdates } from '@/components/app/ProjectUpdates';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetProject, MAX_PROJECT_FILE_BYTES } from '@/lib/api/projects';
import type { ClientProject } from '@/lib/api/types';
import { firstParam } from '@/lib/format';
import {
  deleteProjectAction,
  deleteProjectFileAction,
  postProjectUpdateAction,
  updateProjectAction,
} from '../actions';
import { ProjectForm } from '../ProjectForm';

/** Result of an upload made without JavaScript (the route handler redirects back with it). */
const UPLOAD_RESULTS = {
  uploaded: { tone: 'success', key: 'fileUploaded' },
  tooLarge: { tone: 'error', key: 'fileTooLarge' },
  failed: { tone: 'error', key: 'fileFailed' },
} as const;

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ files?: string | string[] }>;
}) {
  const { locale: rawLocale, id } = await params;
  const filesParam = firstParam((await searchParams).files);
  const uploadResult =
    filesParam && Object.hasOwn(UPLOAD_RESULTS, filesParam)
      ? UPLOAD_RESULTS[filesParam as keyof typeof UPLOAD_RESULTS]
      : undefined;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });

  let project: ClientProject;
  try {
    project = await adminGetProject(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  return (
    <div className={styles.stack}>
      <PageHeader title={project.name} back={{ href: '/admin/projects', label: t('back') }} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('edit')}</h2>
        <ProjectForm
          locale={locale}
          action={updateProjectAction.bind(null, locale, project.id)}
          project={project}
        />
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('updatesTitle')}</h2>
        <div className={styles.stack}>
          <ActionForm
            action={postProjectUpdateAction.bind(null, locale, project.id)}
            className={styles.form}
          >
            <FormInput name="title" label={t('updateTitle')} required />
            <FormTextarea name="body" label={t('updateBody')} rows={6} mono required />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('posting')}>{t('postUpdate')}</SubmitButton>
            </div>
          </ActionForm>
          <ProjectUpdates updates={project.updates ?? []} locale={locale} empty={t('noUpdates')} />
        </div>
      </section>

      <section className={styles.panel} id="files">
        <h2 className={styles.panelTitle}>{t('filesTitle')}</h2>
        <div className={styles.stack}>
          <p className={styles.muted}>{t('filesLead')}</p>
          {uploadResult ? <Alert tone={uploadResult.tone}>{t(uploadResult.key)}</Alert> : null}
          <ProjectFileUpload
            action={`/${locale}/admin/projects/${project.id}/files`}
            maxBytes={MAX_PROJECT_FILE_BYTES}
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
          <ProjectFiles
            projectId={project.id}
            files={project.files ?? []}
            locale={locale}
            empty={t('noFiles')}
            deleteAction={(fileId) =>
              deleteProjectFileAction.bind(null, locale, project.id, fileId)
            }
          />
        </div>
      </section>

      <DeleteForm
        action={deleteProjectAction.bind(null, locale, project.id)}
        title={t('deleteTitle')}
        body={t('deleteBody')}
      />
    </div>
  );
}
