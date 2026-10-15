import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectMilestone } from '@/lib/api/types';
import { toDateInput } from '@/lib/format';
import {
  deleteMilestoneAction,
  reorderMilestonesAction,
  setMilestoneDoneAction,
  updateMilestoneAction,
} from './actions';

/** `ids` with the item at `from` moved to `to`. */
function moved(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * Admin buttons for one milestone of the timeline: done/reopen, move up/down, and an edit panel
 * with the delete control. Plain forms, so they work without JavaScript.
 */
export async function MilestoneControls({
  locale,
  projectId,
  milestone,
  index,
  ids,
}: {
  locale: AppLocale;
  projectId: string;
  milestone: ProjectMilestone;
  index: number;
  /** Every milestone of the project, in the current order. */
  ids: string[];
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const done = !!milestone.completedAt;
  const field = (name: string) => `milestone-${milestone.id}-${name}`;

  return (
    <div className={styles.milestoneControls}>
      <div className={styles.milestoneButtons}>
        <ActionForm
          action={setMilestoneDoneAction.bind(null, locale, projectId, milestone.id, !done)}
        >
          <SubmitButton size="sm" variant={done ? 'outline' : 'primary'}>
            {done ? t('milestoneReopen') : t('milestoneMarkDone')}
          </SubmitButton>
        </ActionForm>
        {index > 0 ? (
          <ActionForm
            action={reorderMilestonesAction.bind(
              null,
              locale,
              projectId,
              moved(ids, index, index - 1),
            )}
          >
            <SubmitButton size="sm" variant="ghost">
              {t('milestoneUp')}
            </SubmitButton>
          </ActionForm>
        ) : null}
        {index < ids.length - 1 ? (
          <ActionForm
            action={reorderMilestonesAction.bind(
              null,
              locale,
              projectId,
              moved(ids, index, index + 1),
            )}
          >
            <SubmitButton size="sm" variant="ghost">
              {t('milestoneDown')}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>

      <details className={styles.milestoneEdit}>
        <summary>{t('milestoneEdit')}</summary>
        <div className={styles.stack}>
          <ActionForm
            action={updateMilestoneAction.bind(null, locale, projectId, milestone.id)}
            className={styles.form}
          >
            <div className={styles.row}>
              <FormInput
                id={field('title')}
                name="title"
                label={t('milestoneTitle')}
                required
                defaultValue={milestone.title}
              />
              <FormInput
                id={field('dueDate')}
                name="dueDate"
                type="date"
                label={t('milestoneDueDate')}
                optionalLabel={tc('optional')}
                defaultValue={toDateInput(milestone.dueDate)}
              />
            </div>
            <FormTextarea
              id={field('description')}
              name="description"
              label={t('milestoneDescription')}
              optionalLabel={tc('optional')}
              rows={3}
              defaultValue={milestone.description ?? ''}
            />
            <div className={styles.actions}>
              <SubmitButton size="sm" pendingLabel={tc('saving')}>
                {tc('save')}
              </SubmitButton>
            </div>
          </ActionForm>
          <ActionForm
            action={deleteMilestoneAction.bind(null, locale, projectId, milestone.id)}
            className={styles.fileDelete}
          >
            <FormCheckbox
              id={field('confirm')}
              name="confirm"
              label={tc('confirmDelete')}
              required
            />
            <SubmitButton variant="danger" size="sm" pendingLabel={tc('deleting')}>
              {t('milestoneDelete')}
            </SubmitButton>
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
