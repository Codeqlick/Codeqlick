import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { ProjectFileUpload } from '@/components/app/ProjectFileUpload';
import { MarkdownField } from '@/components/app/MarkdownField';
import { SavedReplyPicker } from '@/components/app/SavedReplyPicker';
import { markdownPreviewLabels } from '@/components/app/markdownPreviewLabels';
import { ProjectFiles } from '@/components/app/ProjectFiles';
import { ProjectTimeline } from '@/components/app/ProjectTimeline';
import { ProjectUpdates } from '@/components/app/ProjectUpdates';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetProject, MAX_PROJECT_FILE_BYTES } from '@/lib/api/projects';
import { adminListSavedReplies } from '@/lib/api/saved-replies';
import type { ClientProject } from '@/lib/api/types';
import { firstParam } from '@/lib/format';
import {
  addMilestoneAction,
  deleteProjectAction,
  deleteProjectFileAction,
  postProjectUpdateAction,
  teamCommentAction,
  updateProjectAction,
} from '../actions';
import { MilestoneControls } from '../MilestoneControls';
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
  const tc = await getTranslations({ locale, namespace: 'Common' });

  let project: ClientProject;
  try {
    project = await adminGetProject(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  const milestones = project.milestones ?? [];
  const tsr = await getTranslations({ locale, namespace: 'Admin.savedReplies' });
  // Optional: the boxes work without them.
  const savedReplies = await adminListSavedReplies().catch(() => []);
  const picker = (
    <SavedReplyPicker
      target="body"
      replies={savedReplies}
      values={{ name: project.client.name, project: project.name }}
      label={tsr('insert')}
      placeholder={tsr('insertPlaceholder')}
    />
  );

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

      <section className={styles.panel} id="milestones">
        <h2 className={styles.panelTitle}>{t('milestonesTitle')}</h2>
        <div className={styles.stack}>
          <p className={styles.muted}>{t('milestonesLead')}</p>
          <ProjectTimeline
            milestones={milestones}
            locale={locale}
            empty={t('noMilestones')}
            showOverdue
            controls={(milestone, index) => (
              <MilestoneControls
                locale={locale}
                projectId={project.id}
                milestone={milestone}
                index={index}
                ids={milestones.map((item) => item.id)}
              />
            )}
          />
          <ActionForm
            action={addMilestoneAction.bind(null, locale, project.id)}
            className={styles.form}
          >
            <h3 className={styles.updateTitle}>{t('milestoneNew')}</h3>
            <div className={styles.row}>
              <FormInput name="title" label={t('milestoneTitle')} required />
              <FormInput
                name="dueDate"
                type="date"
                label={t('milestoneDueDate')}
                optionalLabel={tc('optional')}
              />
            </div>
            <FormTextarea
              name="description"
              label={t('milestoneDescription')}
              optionalLabel={tc('optional')}
              rows={3}
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={tc('creating')}>{t('milestoneAdd')}</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('updatesTitle')}</h2>
        <div className={styles.stack}>
          <ActionForm
            action={postProjectUpdateAction.bind(null, locale, project.id)}
            className={styles.form}
          >
            <FormInput name="title" label={t('updateTitle')} required />
            {picker}
            <MarkdownField
              name="body"
              label={t('updateBody')}
              rows={6}
              mono
              required
              compact
              previewLabels={await markdownPreviewLabels(locale)}
            />
            <FormCheckbox
              name="notifyClient"
              label={t('notifyClient')}
              hint={t('notifyClientHint', { email: project.client.email })}
              defaultChecked
            />
            <FormCheckbox
              name="requestApproval"
              label={t('requestApproval')}
              hint={t('requestApprovalHint')}
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('posting')}>{t('postUpdate')}</SubmitButton>
            </div>
          </ActionForm>
          <ProjectUpdates
            updates={project.updates ?? []}
            locale={locale}
            empty={t('noUpdates')}
            commentAction={(updateId) => teamCommentAction.bind(null, locale, project.id, updateId)}
            commentTools={picker}
          />
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
            fileHref={(fileId) => `/${locale}/portal/projects/${project.id}/files/${fileId}`}
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
