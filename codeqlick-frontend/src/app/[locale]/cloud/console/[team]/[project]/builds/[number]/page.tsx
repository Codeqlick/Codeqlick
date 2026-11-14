import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudBuild, listCloudDeployments, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import { cancelBuildAction, startBuildAction } from '../../../../../actions';
import styles from '../../../../../cloud.module.css';
import { BUILD_TONE, duration } from '../../BuildsTab';

type PageProps = {
  params: Promise<{ locale: string; team: string; project: string; number: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { number } = await params;
  return { title: `Build #${number}` };
}

/** One build: its state, the commit, the deployment it made, and the log (live while it runs). */
export default async function CloudBuildPage({ params }: PageProps) {
  const { locale: raw, team, project: slug, number: rawNumber } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const number = Number(rawNumber);
  if (!Number.isInteger(number) || number < 1) notFound();
  let project;
  let build;
  try {
    project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) notFound();
    build = await getCloudBuild(project.id, number);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const live = build.status === 'QUEUED' || build.status === 'RUNNING';
  const deployment = build.deploymentId
    ? (await listCloudDeployments(project.id).catch(() => null))?.items.find(
        (d) => d.id === build.deploymentId,
      )
    : undefined;

  return (
    <div className={styles.landing}>
      {live ? <AutoRefresh seconds={3} /> : null}
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team}/${slug}?tab=builds`}>← {project.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>Build #{build.number}</h1>
        <p className={styles.rowTitle}>
          <Badge tone={BUILD_TONE[build.status]}>{t(`builds.status.${build.status}`)}</Badge>
          <Badge>{build.target === 'production' ? t('git.production') : t('git.preview')}</Badge>
          {build.noCache ? <Badge>{t('builds.noCache')}</Badge> : null}
          <span className={styles.small}>
            <span className={styles.mono}>{build.branch}</span> ·{' '}
            <span className={styles.mono}>{build.commit.slice(0, 7)}</span>
            {build.pullRequest ? ` · PR #${build.pullRequest}` : ''} ·{' '}
            {formatWhen(build.queuedAt, locale)} · {duration(build.durationMs)}
          </span>
        </p>
        {build.commitMessage ? (
          <p className={styles.muted}>{build.commitMessage.split('\n')[0]}</p>
        ) : null}
        {build.error ? <p className={styles.small}>{build.error}</p> : null}
        {deployment ? (
          <p className={styles.spacedSmall}>
            <a href={deployment.url} target="_blank" rel="noreferrer">
              {deployment.url.replace('https://', '')}
            </a>
          </p>
        ) : null}
      </div>
      {live ? (
        <form action={cancelBuildAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="team" value={team} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="project" value={project.id} />
          <input type="hidden" name="number" value={build.number} />
          <SubmitButton size="sm" variant="outline">
            {t('builds.cancel')}
          </SubmitButton>
        </form>
      ) : null}
      {build.status === 'FAILED' ? (
        <form action={startBuildAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="team" value={team} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="project" value={project.id} />
          <input type="hidden" name="branch" value={build.branch} />
          <input type="hidden" name="noCache" value="on" />
          <SubmitButton size="sm" variant="outline">
            {t('builds.retryNoCache')}
          </SubmitButton>
        </form>
      ) : null}
      <section aria-labelledby="log-title">
        <h2 id="log-title" className={styles.sectionTitle}>
          {t('builds.log')}
        </h2>
        <pre className={`${styles.terminal} ${styles.log}`}>
          {build.log || (build.status === 'QUEUED' ? t('builds.waiting') : t('builds.noLog'))}
        </pre>
      </section>
    </div>
  );
}
