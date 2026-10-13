import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { ProjectUpdates } from '@/components/app/ProjectUpdates';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetProject } from '@/lib/api/projects';
import type { ClientProject } from '@/lib/api/types';
import { deleteProjectAction, postProjectUpdateAction, updateProjectAction } from '../actions';
import { ProjectForm } from '../ProjectForm';

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
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

      <DeleteForm
        action={deleteProjectAction.bind(null, locale, project.id)}
        title={t('deleteTitle')}
        body={t('deleteBody')}
      />
    </div>
  );
}
