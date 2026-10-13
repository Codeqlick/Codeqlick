import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { resolveLocale } from '@/i18n/locale';
import { listMyProjects } from '@/lib/api/projects';

export default async function PortalPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Portal' });
  const tp = await getTranslations({ locale, namespace: 'Phases' });
  const projects = await listMyProjects();

  return (
    <>
      <PageHeader title={t('projectsTitle')} lead={t('projectsLead')} />
      {projects.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <ul className={styles.cards}>
          {projects.map((project) => (
            <Card as="li" bordered key={project.id}>
              <div>
                <Badge tone="brand">{tp(project.phase)}</Badge>
              </div>
              <h2 className={styles.cardTitle}>{project.name}</h2>
              <ProgressBar
                value={project.progress}
                ariaLabel={`${t('progress')}: ${project.name}`}
                label={t('progressValue', { value: project.progress })}
              />
              <div>
                <Button href={`/portal/projects/${project.id}`} variant="outline" size="sm">
                  {t('open')}
                  <span className="visually-hidden"> — {project.name}</span>
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
