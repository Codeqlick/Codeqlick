import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { MarkdownField } from '@/components/app/MarkdownField';
import { markdownPreviewLabels } from '@/components/app/markdownPreviewLabels';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { RELEASE_ENVIRONMENTS, type UpdateDraft } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { discardDraftAction, publishDraftAction } from './actions';

/**
 * Drafts sent with the project's release key, each as an editable form: the team reviews the text,
 * then publishes it (as an update, or a release when it has a version) or discards it.
 */
export async function DraftReview({
  drafts,
  projectId,
  clientEmail,
  locale,
}: {
  drafts: UpdateDraft[];
  projectId: string;
  clientEmail: string;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const te = await getTranslations({ locale, namespace: 'ReleaseEnvironments' });
  const previewLabels = await markdownPreviewLabels(locale);

  return (
    <section className={styles.panel} id="drafts" aria-labelledby="drafts-heading">
      <h2 id="drafts-heading" className={styles.panelTitle}>
        {t('draftsTitle', { count: drafts.length })}
      </h2>
      <div className={styles.stack}>
        <p className={styles.muted}>{t('draftsLead')}</p>
        {drafts.map((draft) => {
          const id = (name: string) => `draft-${draft.id}-${name}`;
          return (
            <article key={draft.id} className={styles.update}>
              <p className={styles.updateMeta}>
                {t('draftReceived', { date: formatDateTime(draft.createdAt, locale) })}
              </p>
              <ActionForm
                action={publishDraftAction.bind(null, locale, projectId, draft.id)}
                className={styles.form}
              >
                <FormInput
                  id={id('title')}
                  name="title"
                  label={t('updateTitle')}
                  defaultValue={draft.title}
                  required
                />
                <MarkdownField
                  id={id('body')}
                  name="body"
                  label={t('updateBody')}
                  rows={8}
                  mono
                  required
                  compact
                  defaultValue={draft.body}
                  previewLabels={previewLabels}
                />
                <div className={styles.row}>
                  <FormInput
                    id={id('version')}
                    name="version"
                    label={t('releaseVersion')}
                    optionalLabel={tc('optional')}
                    hint={t('releaseVersionHint')}
                    defaultValue={draft.version ?? ''}
                    maxLength={40}
                  />
                  <FormSelect
                    id={id('environment')}
                    name="environment"
                    label={t('releaseEnvironment')}
                    options={RELEASE_ENVIRONMENTS.map((value) => ({ value, label: te(value) }))}
                    defaultValue={draft.environment ?? 'STAGING'}
                  />
                </div>
                <FormInput
                  id={id('url')}
                  name="url"
                  type="url"
                  label={t('releaseUrl')}
                  optionalLabel={tc('optional')}
                  defaultValue={draft.url ?? ''}
                />
                <FormCheckbox
                  id={id('notify')}
                  name="notifyClient"
                  label={t('notifyClient')}
                  hint={t('notifyClientHint', { email: clientEmail })}
                  defaultChecked
                />
                <FormCheckbox
                  id={id('approval')}
                  name="requestApproval"
                  label={t('requestApproval')}
                  hint={t('requestApprovalHint')}
                />
                <div className={styles.actions}>
                  <SubmitButton pendingLabel={t('posting')}>{t('publishDraft')}</SubmitButton>
                </div>
              </ActionForm>
              <ActionForm action={discardDraftAction.bind(null, locale, projectId, draft.id)}>
                <SubmitButton variant="ghost" size="sm" pendingLabel={t('discarding')}>
                  {t('discardDraft')}
                  <span className="visually-hidden"> — {draft.title}</span>
                </SubmitButton>
              </ActionForm>
            </article>
          );
        })}
      </div>
    </section>
  );
}
