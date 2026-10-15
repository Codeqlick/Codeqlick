import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListProjects } from '@/lib/api/projects';
import { formatDate, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminProjectsPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });
  const tp = await getTranslations({ locale, namespace: 'Phases' });
  const projects = await adminListProjects({ page: parsePage((await searchParams).page) });
  const newButton = <Button href="/admin/projects/new">{t('new')}</Button>;

  return (
    <>
      <PageHeader title={t('title')} actions={newButton} />
      {projects.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={newButton} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('name')}</th>
                  <th scope="col">{t('client')}</th>
                  <th scope="col">{t('phase')}</th>
                  <th scope="col">{t('progress')}</th>
                  <th scope="col">{t('dueDate')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.items.map((project) => (
                  <tr key={project.id}>
                    <th scope="row">
                      <Link href={`/admin/projects/${project.id}`}>{project.name}</Link>
                    </th>
                    <td>
                      {project.client.name}
                      <span className={styles.sub}>{project.client.email}</span>
                    </td>
                    <td>
                      <Badge tone="brand">{tp(project.phase)}</Badge>
                    </td>
                    <td>{project.progress}%</td>
                    <td>{formatDate(project.dueDate, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={projects.page}
            totalPages={projects.totalPages}
            pathname="/admin/projects"
          />
        </>
      )}
    </>
  );
}
