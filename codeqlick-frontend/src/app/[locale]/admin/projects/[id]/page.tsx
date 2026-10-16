import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { ProjectFileUpload } from '@/components/app/ProjectFileUpload';
import { MarkdownField } from '@/components/app/MarkdownField';
import { SavedReplyPicker } from '@/components/app/SavedReplyPicker';
import { markdownPreviewLabels } from '@/components/app/markdownPreviewLabels';
import { ProjectFiles } from '@/components/app/ProjectFiles';
import { ProjectHours } from '@/components/app/ProjectHours';
import { ProjectTimeline } from '@/components/app/ProjectTimeline';
import { ProjectUpdates } from '@/components/app/ProjectUpdates';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetProject, adminListDrafts, MAX_PROJECT_FILE_BYTES } from '@/lib/api/projects';
import { adminListSavedReplies } from '@/lib/api/saved-replies';
import { RELEASE_ENVIRONMENTS, type ClientProject } from '@/lib/api/types';
import { firstParam, formatDateTime, madridToday } from '@/lib/format';
import { env } from '@/lib/env';
import { ReleaseKeyReveal } from '@/components/app/ReleaseKeyReveal';
import { adminGetProjectTime } from '@/lib/api/time';
import { adminListTasks } from '@/lib/api/tasks';
import { adminGetBrief } from '@/lib/api/briefs';
import { adminGetMonitor } from '@/lib/api/monitoring';
import { listAccess } from '@/lib/api/credentials';
import { adminGetReview } from '@/lib/api/reviews';
import { adminGetPlan } from '@/lib/api/plans';
import { PlanUsage } from '@/components/app/PlanUsage';
import { savePlanAction } from '../plan-actions';
import { requestReviewAction, setReviewStatusAction } from '../review-actions';
import { SharedAccessList } from '@/components/app/SharedAccessList';
import { deleteAllAccessAction, revealAccessAction } from '../../../portal/projects/access-actions';
import { SiteStatus } from '@/components/app/SiteStatus';
import { checkNowAction, setMonitorAction } from '../monitor-actions';
import { BriefSummary } from '@/components/app/BriefSummary';
import { requestBriefAction } from '../brief-actions';
import { ProjectTasks } from '@/components/app/ProjectTasks';
import {
  addMilestoneAction,
  createReleaseKeyAction,
  deleteProjectAction,
  deleteProjectFileAction,
  postProjectUpdateAction,
  revokeReleaseKeyAction,
  teamCommentAction,
  updateProjectAction,
} from '../actions';
import { DraftReview } from '../DraftReview';
import { MilestoneControls } from '../MilestoneControls';
import { deleteTimeAction, logTimeAction } from '../time-actions';
import { createTaskAction, deleteTaskAction, setTaskStatusAction } from '../task-actions';
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
  const te = await getTranslations({ locale, namespace: 'ReleaseEnvironments' });

  let project: ClientProject;
  try {
    project = await adminGetProject(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  const milestones = project.milestones ?? [];
  const th = await getTranslations({ locale, namespace: 'Hours' });
  const [time, drafts, tasks, brief, monitor, access, review, plan] = await Promise.all([
    adminGetProjectTime(project.id),
    adminListDrafts(project.id),
    adminListTasks(project.id),
    adminGetBrief(project.id),
    adminGetMonitor(project.id),
    listAccess(project.id),
    adminGetReview(project.id),
    adminGetPlan(project.id),
  ]);
  const tpl = await getTranslations({ locale, namespace: 'Plans' });
  const trv = await getTranslations({ locale, namespace: 'Review' });
  const tac = await getTranslations({ locale, namespace: 'Access' });
  const tm = await getTranslations({ locale, namespace: 'Monitoring' });
  const tb = await getTranslations({ locale, namespace: 'Brief' });
  const tt = await getTranslations({ locale, namespace: 'Tasks' });
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

      <section className={styles.panel} id="review" aria-labelledby="review-heading">
        <h2 id="review-heading" className={styles.panelTitle}>
          {trv('adminTitle')}
        </h2>
        <div className={styles.stack}>
          <p className={styles.muted}>{trv(`adminStatus.${review.status}`)}</p>
          {review.quote ? (
            <figure className={styles.update}>
              <p aria-label={trv('stars', { count: review.rating ?? 0 })}>
                {'★'.repeat(review.rating ?? 0)}
                {'☆'.repeat(5 - (review.rating ?? 0))}
              </p>
              <blockquote className={styles.prewrap}>{review.quote}</blockquote>
              <figcaption className={styles.muted}>
                {review.authorName}
                {review.authorRole ? ` · ${review.authorRole}` : ''} ·{' '}
                {review.consent ? trv('consentYes') : trv('consentNo')}
              </figcaption>
            </figure>
          ) : null}
          <div className={styles.actions}>
            {review.status === 'NONE' ? (
              <ActionForm action={requestReviewAction.bind(null, locale, project.id)}>
                <SubmitButton variant="outline" size="sm" pendingLabel={trv('sending')}>
                  {trv('request')}
                </SubmitButton>
              </ActionForm>
            ) : null}
            {(review.status === 'SUBMITTED' || review.status === 'HIDDEN') && review.consent ? (
              <ActionForm
                action={setReviewStatusAction.bind(null, locale, project.id, 'PUBLISHED')}
              >
                <SubmitButton size="sm" pendingLabel={trv('sending')}>
                  {trv('publish')}
                </SubmitButton>
              </ActionForm>
            ) : null}
            {review.status === 'PUBLISHED' ? (
              <ActionForm action={setReviewStatusAction.bind(null, locale, project.id, 'HIDDEN')}>
                <SubmitButton variant="outline" size="sm" pendingLabel={trv('sending')}>
                  {trv('hide')}
                </SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.panel} id="access" aria-labelledby="access-heading">
        <h2 id="access-heading" className={styles.panelTitle}>
          {tac('title')}
        </h2>
        <div className={styles.stack}>
          <p className={styles.muted}>{tac('adminLead')}</p>
          <SharedAccessList
            items={access}
            locale={locale}
            revealAction={(id) => revealAccessAction.bind(null, locale, project.id, id)}
          />
          {access.length > 0 ? (
            <ActionForm
              action={deleteAllAccessAction.bind(null, locale, project.id)}
              className={styles.form}
            >
              <FormCheckbox
                id="access-confirm"
                name="confirm"
                label={tac('deleteAllConfirm', { count: access.length })}
                required
              />
              <div>
                <SubmitButton variant="danger" size="sm" pendingLabel={tac('deleting')}>
                  {tac('deleteAll')}
                </SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </div>
      </section>

      <section className={styles.panel} id="monitor" aria-labelledby="monitor-heading">
        <h2 id="monitor-heading" className={styles.panelTitle}>
          {tm('panelTitle')}
        </h2>
        <div className={styles.stack}>
          {'projectId' in monitor && monitor.enabled ? (
            <>
              <SiteStatus monitor={monitor} locale={locale} />
              <div className={styles.actions}>
                <ActionForm action={checkNowAction.bind(null, locale, project.id)}>
                  <SubmitButton variant="outline" size="sm" pendingLabel={tm('checking')}>
                    {tm('checkNow')}
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={setMonitorAction.bind(null, locale, project.id, false)}>
                  <SubmitButton variant="ghost" size="sm" pendingLabel={tm('saving')}>
                    {tm('disable')}
                  </SubmitButton>
                </ActionForm>
              </div>
            </>
          ) : (
            <>
              <p className={styles.muted}>
                {project.productionUrl
                  ? tm('offBody', { url: project.productionUrl })
                  : tm('needsUrl')}
              </p>
              {project.productionUrl ? (
                <ActionForm action={setMonitorAction.bind(null, locale, project.id, true)}>
                  <SubmitButton variant="outline" size="sm" pendingLabel={tm('saving')}>
                    {tm('enable')}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className={styles.panel} id="brief" aria-labelledby="brief-heading">
        <h2 id="brief-heading" className={styles.panelTitle}>
          {tb('adminTitle')}
        </h2>
        <div className={styles.stack}>
          <p className={styles.muted}>
            {brief.status === 'SUBMITTED' && brief.submittedAt
              ? tb('adminSubmitted', { date: formatDateTime(brief.submittedAt, locale) })
              : brief.status === 'REQUESTED'
                ? tb('adminRequested')
                : tb('adminNone')}
          </p>
          {brief.status !== 'NONE' ? <BriefSummary brief={brief} locale={locale} /> : null}
          {brief.status !== 'SUBMITTED' ? (
            <ActionForm action={requestBriefAction.bind(null, locale, project.id)}>
              <SubmitButton variant="outline" size="sm" pendingLabel={tb('requesting')}>
                {brief.status === 'REQUESTED' ? tb('remind') : tb('request')}
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      </section>

      <section className={styles.panel} id="tasks" aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className={styles.panelTitle}>
          {tt('title')}
        </h2>
        <div className={styles.stack}>
          <ProjectTasks
            items={tasks}
            locale={locale}
            empty={tt('empty')}
            statusAction={(taskId, status) =>
              setTaskStatusAction.bind(null, locale, project.id, taskId, status)
            }
            deleteAction={(taskId) => deleteTaskAction.bind(null, locale, project.id, taskId)}
            ticketHref={(ticketId) => `/${locale}/admin/support/${ticketId}`}
          />
          <details className={styles.commentForm}>
            <summary>{tt('add')}</summary>
            {/* Keyed by the number of tasks: an added task empties the form. */}
            <ActionForm
              key={tasks.length}
              action={createTaskAction.bind(null, locale, project.id)}
              className={styles.form}
            >
              <FormInput
                id="task-title"
                name="title"
                label={tt('taskTitle')}
                maxLength={200}
                required
              />
              <FormTextarea
                id="task-description"
                name="description"
                label={tt('description')}
                optionalLabel={tc('optional')}
                hint={tt('descriptionHint')}
                rows={3}
              />
              <div className={styles.actions}>
                <SubmitButton pendingLabel={tt('adding')}>{tt('addButton')}</SubmitButton>
              </div>
            </ActionForm>
          </details>
        </div>
      </section>

      {drafts.length > 0 ? (
        <DraftReview
          drafts={drafts}
          projectId={project.id}
          clientEmail={project.client.email}
          locale={locale}
        />
      ) : null}

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
            <details className={styles.commentForm}>
              <summary>{t('asRelease')}</summary>
              <div className={styles.form}>
                <p className={styles.muted}>{t('asReleaseHint')}</p>
                <div className={styles.row}>
                  <FormInput
                    name="version"
                    label={t('releaseVersion')}
                    hint={t('releaseVersionHint')}
                    maxLength={40}
                  />
                  <FormSelect
                    name="environment"
                    label={t('releaseEnvironment')}
                    options={RELEASE_ENVIRONMENTS.map((value) => ({
                      value,
                      label: te(value),
                    }))}
                    defaultValue="STAGING"
                  />
                </div>
                <FormInput
                  name="url"
                  type="url"
                  label={t('releaseUrl')}
                  optionalLabel={tc('optional')}
                  hint={t('releaseUrlHint')}
                />
              </div>
            </details>
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

      <section className={styles.panel} id="release-key" aria-labelledby="release-key-heading">
        <h2 id="release-key-heading" className={styles.panelTitle}>
          {t('releaseKeyTitle')}
        </h2>
        <div className={styles.stack}>
          <p className={styles.muted}>{t('releaseKeyLead')}</p>
          <p>
            {project.releaseKeyCreatedAt
              ? t('releaseKeyActive', { date: formatDateTime(project.releaseKeyCreatedAt, locale) })
              : t('releaseKeyNone')}
          </p>
          <ActionForm
            action={createReleaseKeyAction.bind(null, locale, project.id)}
            className={styles.form}
          >
            <ReleaseKeyReveal
              endpoint={`${env.PUBLIC_API_URL}/releases`}
              labels={{
                copy: t('releaseKeyCopy'),
                copied: t('releaseKeyCopied'),
                example: t('releaseKeyExample'),
              }}
            />
            <div className={styles.actions}>
              <SubmitButton variant="outline" size="sm" pendingLabel={t('releaseKeyCreating')}>
                {project.releaseKeyCreatedAt ? t('releaseKeyReplace') : t('releaseKeyCreate')}
              </SubmitButton>
            </div>
          </ActionForm>
          {project.releaseKeyCreatedAt ? (
            <ActionForm action={revokeReleaseKeyAction.bind(null, locale, project.id)}>
              <SubmitButton variant="ghost" size="sm" pendingLabel={t('releaseKeyRevoking')}>
                {t('releaseKeyRevoke')}
              </SubmitButton>
            </ActionForm>
          ) : null}
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

      <section className={styles.panel} id="plan" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className={styles.panelTitle}>
          {tpl('title')}
        </h2>
        <div className={styles.stack}>
          {'month' in plan && plan.active ? <PlanUsage plan={plan} locale={locale} /> : null}
          <p className={styles.muted}>{tpl('adminLead')}</p>
          <ActionForm
            key={'month' in plan ? `${plan.name}-${plan.monthlyMinutes}-${plan.active}` : 'none'}
            action={savePlanAction.bind(null, locale, project.id)}
            className={styles.form}
          >
            <div className={styles.row}>
              <FormInput
                id="plan-name"
                name="name"
                label={tpl('name')}
                placeholder={tpl('namePlaceholder')}
                defaultValue={'month' in plan ? plan.name : ''}
                required
              />
              <FormInput
                id="plan-hours"
                name="hours"
                label={tpl('hours')}
                inputMode="decimal"
                defaultValue={'month' in plan ? String(plan.monthlyMinutes / 60) : ''}
                required
              />
              <FormInput
                id="plan-alert"
                name="alertPercent"
                type="number"
                min={10}
                max={99}
                label={tpl('alert')}
                hint={tpl('alertHint')}
                defaultValue={'month' in plan ? String(plan.alertPercent) : '80'}
              />
            </div>
            <FormCheckbox
              id="plan-active"
              name="active"
              label={tpl('active')}
              hint={tpl('activeHint')}
              defaultChecked={'month' in plan ? plan.active : true}
            />
            <div className={styles.actions}>
              <SubmitButton size="sm" pendingLabel={tpl('saving')}>
                {tpl('save')}
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className={styles.panel} id="time" aria-labelledby="time-heading">
        <h2 id="time-heading" className={styles.panelTitle}>
          {th('title')}
        </h2>
        <div className={styles.stack}>
          <p className={styles.muted}>
            {project.showHours ? th('shownToClient') : th('hiddenFromClient')}
          </p>
          {/* Keyed by the number of entries: a logged entry empties the form. */}
          <ActionForm
            key={time.entries.length}
            action={logTimeAction.bind(null, locale, project.id)}
            className={styles.form}
          >
            <div className={styles.row}>
              <FormInput
                name="date"
                type="date"
                label={th('date')}
                required
                defaultValue={madridToday()}
              />
              <FormInput
                name="minutes"
                label={th('duration')}
                hint={th('durationHint')}
                inputMode="decimal"
                required
              />
            </div>
            <FormInput name="description" label={th('description')} maxLength={500} required />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={th('logging')}>{th('log')}</SubmitButton>
            </div>
          </ActionForm>
          <ProjectHours
            time={time}
            locale={locale}
            empty={th('empty')}
            deleteAction={(entryId) => deleteTimeAction.bind(null, locale, project.id, entryId)}
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
