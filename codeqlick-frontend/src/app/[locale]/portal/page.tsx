import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { resolveLocale } from '@/i18n/locale';
import { nextMilestone } from '@/components/app/ProjectTimeline';
import { PortalTodo } from '@/components/portal/PortalTodo';
import { getMyTodo, listMyProjects } from '@/lib/api/projects';
import { formatDate } from '@/lib/format';

export default async function PortalPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Portal' });
  const tp = await getTranslations({ locale, namespace: 'Phases' });
  const [projects, todo] = await Promise.all([
    listMyProjects(),
    // Optional: the projects page works without it.
    getMyTodo().catch(() => ({ items: [] })),
  ]);
  const waitingOn = (projectId: string) =>
    todo.items.filter((item) => item.projectId === projectId).length;

  return (
    <div className={styles.stack}>
      <PageHeader title={t('projectsTitle')} lead={t('projectsLead')} />
      <PortalTodo items={todo.items} locale={locale} />
      {projects.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <ul className={styles.cards}>
          {projects.map((project) => {
            const next = nextMilestone(project.milestones ?? []);
            const waiting = waitingOn(project.id);
            return (
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
                {next ? (
                  <p className={styles.muted}>
                    {next.dueDate
                      ? t('cardNextDated', {
                          title: next.title,
                          date: formatDate(next.dueDate, locale),
                        })
                      : t('cardNext', { title: next.title })}
                  </p>
                ) : null}
                {waiting > 0 ? (
                  <p>
                    <Badge tone="warning">{t('cardWaiting', { count: waiting })}</Badge>
                  </p>
                ) : null}
                <div>
                  <Button href={`/portal/projects/${project.id}`} variant="outline" size="sm">
                    {t('open')}
                    <span className="visually-hidden"> — {project.name}</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
