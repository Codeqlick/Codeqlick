import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { resolveLocale } from '@/i18n/locale';
import { createProjectAction } from '../actions';
import { ProjectForm } from '../ProjectForm';

export default async function NewProjectPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });

  return (
    <>
      <PageHeader title={t('new')} back={{ href: '/admin/projects', label: t('back') }} />
      <section className={styles.panel}>
        <ProjectForm locale={locale} action={createProjectAction.bind(null, locale)} />
      </section>
    </>
  );
}
