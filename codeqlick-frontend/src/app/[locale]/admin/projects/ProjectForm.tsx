import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormInput,
  FormSelect,
  type FormAction,
} from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { MarkdownField } from '@/components/app/MarkdownField';
import { markdownPreviewLabels } from '@/components/app/markdownPreviewLabels';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { PROJECT_PHASES, type ClientProject } from '@/lib/api/types';
import { adminListUsers } from '@/lib/api/users';
import { toDateInput } from '@/lib/format';

/** Create/edit form for a client project. Clients come from the users with the CLIENT role. */
export async function ProjectForm({
  locale,
  action,
  project,
}: {
  locale: AppLocale;
  action: FormAction;
  project?: ClientProject;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tp = await getTranslations({ locale, namespace: 'Phases' });

  const clients = (await adminListUsers({ role: 'CLIENT', pageSize: 100 })).items;
  const options = clients.map((client) => ({
    value: client.id,
    label: `${client.name} (${client.email})`,
  }));
  // Keep the current client selectable even when it is not in the list (e.g. role changed).
  if (project && !clients.some((client) => client.id === project.client.id)) {
    options.unshift({
      value: project.client.id,
      label: `${project.client.name} (${project.client.email})`,
    });
  }
  if (options.length === 0) return <Alert>{t('noClients')}</Alert>;

  return (
    <ActionForm action={action} className={styles.form}>
      <div className={styles.row}>
        <FormInput name="name" label={t('name')} required defaultValue={project?.name} />
        <FormSelect
          name="clientId"
          label={t('client')}
          placeholder={t('clientPlaceholder')}
          options={options}
          required
          defaultValue={project?.client.id ?? ''}
        />
      </div>
      <MarkdownField
        name="description"
        label={t('description')}
        optionalLabel={tc('optional')}
        rows={5}
        defaultValue={project?.description ?? ''}
        compact
        previewLabels={await markdownPreviewLabels(locale)}
      />
      <div className={styles.row}>
        <FormSelect
          name="phase"
          label={t('phase')}
          options={PROJECT_PHASES.map((value) => ({ value, label: tp(value) }))}
          defaultValue={project?.phase ?? 'DISCOVERY'}
        />
        <FormInput
          name="progress"
          type="number"
          min={0}
          max={100}
          label={t('progress')}
          required
          defaultValue={String(project?.progress ?? 0)}
        />
      </div>
      <div className={styles.row}>
        <FormInput
          name="startDate"
          type="date"
          label={t('startDate')}
          optionalLabel={tc('optional')}
          defaultValue={toDateInput(project?.startDate)}
        />
        <FormInput
          name="dueDate"
          type="date"
          label={t('dueDate')}
          optionalLabel={tc('optional')}
          defaultValue={toDateInput(project?.dueDate)}
        />
      </div>
      <div className={styles.row}>
        <FormInput
          name="stagingUrl"
          type="url"
          label={t('stagingUrl')}
          optionalLabel={tc('optional')}
          defaultValue={project?.stagingUrl ?? ''}
        />
        <FormInput
          name="productionUrl"
          type="url"
          label={t('productionUrl')}
          optionalLabel={tc('optional')}
          defaultValue={project?.productionUrl ?? ''}
        />
      </div>
      <FormCheckbox
        name="showHours"
        label={t('showHours')}
        hint={t('showHoursHint')}
        defaultChecked={project?.showHours ?? false}
      />
      <div className={styles.actions}>
        <SubmitButton pendingLabel={project ? tc('saving') : tc('creating')}>
          {project ? tc('save') : tc('create')}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
