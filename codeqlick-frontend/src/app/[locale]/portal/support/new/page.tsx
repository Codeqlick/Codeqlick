import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { listMyProjects } from '@/lib/api/projects';
import { TICKET_PRIORITIES, TICKET_TYPES } from '@/lib/api/types';
import { firstParam } from '@/lib/format';
import { openTicketAction } from '../actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewTicketPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Support' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const projects = await listMyProjects();
  // Opened from a project page: that project comes preselected.
  const requested = firstParam((await searchParams).project);
  const projectId =
    projects.find((project) => project.id === requested)?.id ??
    (projects.length === 1 ? projects[0]?.id : undefined);

  return (
    <div className={styles.stack}>
      <PageHeader title={t('new')} back={{ href: '/portal/support', label: t('back') }} />
      <section className={styles.panel}>
        <ActionForm action={openTicketAction.bind(null, locale)} className={styles.form}>
          <p className={styles.muted}>{t('newLead')}</p>
          <div className={styles.row}>
            <FormSelect
              name="type"
              label={t('type')}
              options={TICKET_TYPES.map((value) => ({ value, label: t(`types.${value}`) }))}
              defaultValue="QUESTION"
            />
            <FormSelect
              name="priority"
              label={t('priority')}
              hint={t('priorityHint')}
              options={TICKET_PRIORITIES.map((value) => ({
                value,
                label: t(`priorities.${value}`),
              }))}
              defaultValue="NORMAL"
            />
          </div>
          {projects.length > 0 ? (
            <FormSelect
              name="projectId"
              label={t('project')}
              optionalLabel={tc('optional')}
              placeholder={t('noProject')}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              defaultValue={projectId ?? ''}
            />
          ) : null}
          <FormInput name="title" label={t('titleLabel')} maxLength={200} required />
          <FormTextarea
            name="body"
            label={t('description')}
            hint={t('descriptionHint')}
            rows={8}
            required
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('sending')}>{t('send')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
