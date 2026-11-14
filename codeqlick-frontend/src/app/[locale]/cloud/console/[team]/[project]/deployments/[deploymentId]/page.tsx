import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CompareGroup } from '@/components/cloud/CompareGroup';
import { DeploymentFiles } from '@/components/cloud/DeploymentFiles';
import compareStyles from '@/components/cloud/DeploymentFiles.module.css';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import {
  compareCloudDeployment,
  getCloudDeployment,
  listCloudDeploymentFiles,
  listCloudProjects,
  type CloudDeployment,
  type CloudProject,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatBytes, formatWhen, isDeploymentId } from '@/lib/cloud';
import styles from '../../../../../cloud.module.css';

/** Rows of each comparison group rendered; the CLI's `codeqlick diff` prints them all. */
const COMPARE_ROWS = 1000;

type PageProps = {
  params: Promise<{ locale: string; team: string; project: string; deploymentId: string }>;
  searchParams: Promise<{ view?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const t = await getTranslations({ locale: resolveLocale(raw), namespace: 'Cloud.deployment' });
  return { title: t('metaTitle') };
}

async function load(teamSlug: string, projectSlug: string, deploymentId: string) {
  try {
    const project = (await listCloudProjects(teamSlug)).items.find(
      (item) => item.slug === projectSlug,
    );
    if (!project) notFound();
    const deployment = await getCloudDeployment(project.id, deploymentId);
    return { project, deployment };
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

/**
 * One deployment (architecture 4.13, "Files and comparison"): its files with a filter box, and,
 * unless it is production, how it differs from production. The comparison hashes files on the
 * API, so it is only asked for on its own view (`?view=compare`), never on every page view.
 */
export default async function CloudDeploymentPage({ params, searchParams }: PageProps) {
  const { locale: raw, team, project: slug, deploymentId } = await params;
  const { view } = await searchParams;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  if (!isDeploymentId(deploymentId)) notFound();
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const { project, deployment } = await load(team, slug, deploymentId);
  const projectBase = `/cloud/console/${team}/${project.slug}`;
  const base = `${projectBase}/deployments/${deployment.id}`;
  const comparing = view === 'compare' && !deployment.isProduction;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={projectBase}>← {project.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('deployment.title', { id: deployment.shortId })}</h1>
        <p className={styles.rowTitle}>
          {deployment.isProduction ? (
            <Badge tone="success">{t('project.productionTag')}</Badge>
          ) : (
            <Badge>{t('project.preview')}</Badge>
          )}
          {deployment.message ? <span>{deployment.message}</span> : null}
        </p>
        <p className={styles.small}>
          <a href={deployment.url} className={styles.mono} target="_blank" rel="noreferrer">
            {deployment.url.replace('https://', '')}
          </a>
        </p>
        <p className={styles.small}>
          {formatWhen(deployment.createdAt, locale)}
          {deployment.createdBy ? ` · ${deployment.createdBy.name}` : ''}
          {deployment.viaToken ? ` · ${t('project.via', { token: deployment.viaToken })}` : ''}
          {' · '}
          {formatBytes(deployment.sizeBytes, locale)}
          {' · '}
          {t('project.files', { count: deployment.fileCount })}
          {deployment.commit ? ` · ${deployment.commit.slice(0, 7)}` : ''}
          {deployment.branch ? ` (${deployment.branch})` : ''}
        </p>
        <nav
          className={`${styles.tabs} ${styles.spacedTabs}`}
          aria-label={t('deployment.title', { id: deployment.shortId })}
        >
          <Link href={base} className={styles.tab} aria-current={comparing ? undefined : 'page'}>
            {t('deployment.tabs.files')}
          </Link>
          {deployment.isProduction ? null : (
            <Link
              href={`${base}?view=compare`}
              className={styles.tab}
              aria-current={comparing ? 'page' : undefined}
            >
              {t('deployment.tabs.compare')}
            </Link>
          )}
        </nav>
      </div>

      {comparing ? (
        <Compare locale={locale} project={project} deployment={deployment} />
      ) : (
        <Files locale={locale} projectId={project.id} deploymentId={deployment.id} />
      )}
    </div>
  );
}

async function Files({
  locale,
  projectId,
  deploymentId,
}: {
  locale: AppLocale;
  projectId: string;
  deploymentId: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const files = await listCloudDeploymentFiles(projectId, deploymentId).catch((error: unknown) =>
    isApiError(error) && error.status === 404 ? ('gone' as const) : null,
  );
  return (
    <section aria-labelledby="files-title" className={styles.landing}>
      <div>
        <h2 id="files-title" className={styles.sectionTitle}>
          {t('deployment.tabs.files')}
        </h2>
        {files && files !== 'gone' ? (
          <p className={styles.muted}>
            {t('deployment.filesSummary', {
              count: files.count,
              size: formatBytes(files.totalBytes, locale),
            })}
          </p>
        ) : null}
      </div>
      {files === null ? (
        <Alert tone="error">{t('common.loadError')}</Alert>
      ) : files === 'gone' ? (
        <Alert tone="info">{t('deployment.filesGone')}</Alert>
      ) : files.items.length === 0 ? (
        <p className={styles.muted}>{t('deployment.filesEmpty')}</p>
      ) : (
        <DeploymentFiles items={files.items} locale={locale} />
      )}
    </section>
  );
}

async function Compare({
  locale,
  project,
  deployment,
}: {
  locale: AppLocale;
  project: CloudProject;
  deployment: CloudDeployment;
}) {
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const result = await compareCloudDeployment(project.id, deployment.id, 'production').catch(
    (error: unknown) => {
      if (isApiError(error) && error.status === 409) return 'noProduction' as const;
      if (isApiError(error) && error.status === 404) return 'gone' as const;
      return null;
    },
  );
  const production = project.production;
  const labels = { path: t('deployment.path'), size: t('deployment.size') };
  const more = (count: number) =>
    count > COMPARE_ROWS
      ? t('deployment.compare.more', {
          count: count - COMPARE_ROWS,
          command: `codeqlick diff ${deployment.shortId}`,
        })
      : undefined;

  return (
    <section aria-labelledby="compare-title" className={styles.landing}>
      <div>
        <h2 id="compare-title" className={styles.sectionTitle}>
          {t('deployment.tabs.compare')}
        </h2>
        <p className={styles.muted}>
          {production && result !== 'noProduction'
            ? t('deployment.compare.lead', { id: production.shortId })
            : t('deployment.compare.leadPlain')}
        </p>
      </div>
      {result === null ? (
        <Alert tone="error">{t('common.loadError')}</Alert>
      ) : result === 'noProduction' ? (
        <Alert tone="info">{t('deployment.compare.noProduction')}</Alert>
      ) : result === 'gone' ? (
        <Alert tone="info">{t('deployment.compare.gone')}</Alert>
      ) : (
        <>
          <dl className={compareStyles.totals}>
            <div>
              <dt>{t('deployment.compare.thisTotal')}</dt>
              <dd>{formatBytes(result.totalBytes, locale)}</dd>
            </div>
            <div>
              <dt>{t('deployment.compare.productionTotal')}</dt>
              <dd>{formatBytes(result.withTotalBytes, locale)}</dd>
            </div>
            <div>
              <dt>{t('deployment.compare.unchanged')}</dt>
              <dd>{t('deployment.compare.unchangedCount', { count: result.unchanged })}</dd>
            </div>
          </dl>
          {result.added.length + result.removed.length + result.changed.length === 0 ? (
            <Alert tone="success">{t('deployment.compare.identical')}</Alert>
          ) : null}
          <div className={compareStyles.groups}>
            <CompareGroup
              title={t('deployment.compare.added')}
              help={t('deployment.compare.addedHelp')}
              count={result.added.length}
              items={result.added.slice(0, COMPARE_ROWS)}
              locale={locale}
              labels={labels}
              empty={t('deployment.compare.none')}
              more={more(result.added.length)}
            />
            <CompareGroup
              title={t('deployment.compare.removed')}
              help={t('deployment.compare.removedHelp')}
              count={result.removed.length}
              items={result.removed.slice(0, COMPARE_ROWS)}
              locale={locale}
              labels={labels}
              empty={t('deployment.compare.none')}
              more={more(result.removed.length)}
            />
            <CompareGroup
              title={t('deployment.compare.changed')}
              help={t('deployment.compare.changedHelp')}
              count={result.changed.length}
              items={result.changed.slice(0, COMPARE_ROWS)}
              locale={locale}
              labels={{
                path: t('deployment.path'),
                size: t('deployment.compare.newSize'),
                previousSize: t('deployment.compare.previousSize'),
                change: t('deployment.compare.change'),
              }}
              empty={t('deployment.compare.none')}
              more={more(result.changed.length)}
            />
          </div>
        </>
      )}
    </section>
  );
}
