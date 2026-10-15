import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { ProjectFiles } from '@/components/app/ProjectFiles';
import { nextMilestone, ProjectTimeline } from '@/components/app/ProjectTimeline';
import { ProjectUpdates } from '@/components/app/ProjectUpdates';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMyProject } from '@/lib/api/projects';
import type { ClientProject } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { approveAction, commentAction } from '../actions';

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Portal' });
  const tp = await getTranslations({ locale, namespace: 'Phases' });

  let project: ClientProject;
  try {
    project = await getMyProject(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  const user = await getCurrentUser();
  const milestones = project.milestones ?? [];
  const next = nextMilestone(milestones);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={project.name}
        back={{ href: '/portal', label: t('back') }}
        actions={
          <Button href={`/portal/support/new?project=${project.id}`} variant="outline" size="sm">
            {t('askSupport')}
          </Button>
        }
      />

      <section className={styles.panel}>
        <dl className={styles.facts}>
          <div>
            <dt>{t('phase')}</dt>
            <dd>
              <Badge tone="brand">{tp(project.phase)}</Badge>
            </dd>
          </div>
          <div>
            <dt>{t('progress')}</dt>
            <dd>
              <ProgressBar
                value={project.progress}
                ariaLabel={t('progress')}
                label={t('progressValue', { value: project.progress })}
              />
            </dd>
          </div>
          {next ? (
            <div>
              <dt>{t('nextMilestone')}</dt>
              <dd>
                <a href="#milestones">{next.title}</a>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t('startDate')}</dt>
            <dd>{formatDate(project.startDate, locale)}</dd>
          </div>
          <div>
            <dt>{t('dueDate')}</dt>
            <dd>{formatDate(project.dueDate, locale)}</dd>
          </div>
          {project.stagingUrl ? (
            <div>
              <dt>{t('staging')}</dt>
              <dd>
                <a href={project.stagingUrl} target="_blank" rel="noopener noreferrer">
                  {project.stagingUrl}
                </a>
              </dd>
            </div>
          ) : null}
          {project.productionUrl ? (
            <div>
              <dt>{t('production')}</dt>
              <dd>
                <a href={project.productionUrl} target="_blank" rel="noopener noreferrer">
                  {project.productionUrl}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {project.description ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('about')}</h2>
          <Markdown compact>{project.description}</Markdown>
        </section>
      ) : null}

      {milestones.length > 0 ? (
        <section className={styles.panel} id="milestones">
          <h2 className={styles.panelTitle}>{t('milestones')}</h2>
          <ProjectTimeline milestones={milestones} locale={locale} empty="" />
        </section>
      ) : null}

      {project.files && project.files.length > 0 ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('files')}</h2>
          <ProjectFiles
            projectId={project.id}
            files={project.files}
            locale={locale}
            empty={t('noFiles')}
          />
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('updates')}</h2>
        <ProjectUpdates
          updates={project.updates ?? []}
          locale={locale}
          empty={t('noUpdates')}
          commentAction={(updateId) => commentAction.bind(null, locale, project.id, updateId)}
          // Approving is the client's call; admins looking at the portal only comment.
          approveAction={
            user?.role === 'CLIENT'
              ? (updateId) => approveAction.bind(null, locale, project.id, updateId)
              : undefined
          }
        />
      </section>
    </div>
  );
}
