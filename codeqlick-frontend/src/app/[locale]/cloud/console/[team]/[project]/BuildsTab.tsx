import { getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getCloudGit, listCloudBuilds, type CloudBuildStatus } from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import { startBuildAction } from '../../../actions';
import styles from '../../../cloud.module.css';

export const BUILD_TONE: Record<CloudBuildStatus, BadgeTone> = {
  QUEUED: 'warning',
  RUNNING: 'brand',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELED: 'neutral',
};

/** "1 min 20 s". */
export function duration(ms: number | null): string {
  if (ms === null) return '—';
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes ? `${minutes} min ` : ''}${seconds % 60} s`;
}

type Props = {
  locale: AppLocale;
  teamSlug: string;
  projectId: string;
  projectSlug: string;
  base: string;
  page: number;
};

/** A project's builds from Git, newest first, with "Deploy again". */
export async function BuildsTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const [git, list] = await Promise.all([
    getCloudGit(props.projectId),
    listCloudBuilds(props.projectId, props.page),
  ]);
  return (
    <section className={styles.landing} aria-labelledby="builds-title">
      <div className={styles.actions}>
        <h2 id="builds-title" className={styles.sectionTitle}>
          {t('project.tabs.builds')}
        </h2>
        {git.repo ? (
          <form action={startBuildAction}>
            <input type="hidden" name="locale" value={props.locale} />
            <input type="hidden" name="team" value={props.teamSlug} />
            <input type="hidden" name="slug" value={props.projectSlug} />
            <input type="hidden" name="project" value={props.projectId} />
            <SubmitButton size="sm" variant="outline">
              {list.items.length === 0 && list.page === 1
                ? t('builds.first', { branch: git.branch })
                : t('builds.again', { branch: git.branch })}
            </SubmitButton>
          </form>
        ) : null}
      </div>
      {!git.repo ? <p className={styles.muted}>{t('builds.noRepo')}</p> : null}
      {list.items.length === 0 ? (
        git.repo ? (
          <p className={styles.muted}>{t('builds.empty')}</p>
        ) : null
      ) : (
        <>
          <ul className={styles.list}>
            {list.items.map((build) => (
              <li key={build.id} className={`${styles.row} ${styles.tileRow}`}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <Link
                      href={`/cloud/console/${props.teamSlug}/${props.projectSlug}/builds/${build.number}`}
                      className={styles.tileLink}
                    >
                      #{build.number}
                    </Link>
                    <Badge tone={BUILD_TONE[build.status]}>
                      {t(`builds.status.${build.status}`)}
                    </Badge>
                    <Badge>
                      {build.target === 'production' ? t('git.production') : t('git.preview')}
                    </Badge>
                    {build.keptAsPreview ? (
                      <Badge tone="warning">{t('builds.keptByLock')}</Badge>
                    ) : null}
                    <span>{(build.commitMessage ?? '').split('\n')[0]}</span>
                  </p>
                  <p className={styles.small}>
                    <span className={styles.mono}>{build.branch}</span> ·{' '}
                    <span className={styles.mono}>{build.commit.slice(0, 7)}</span>
                    {build.pullRequest ? ` · PR #${build.pullRequest}` : ''}
                    {build.author ? ` · ${build.author}` : ''} ·{' '}
                    {formatWhen(build.queuedAt, props.locale)} · {duration(build.durationMs)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.page}
            totalPages={list.totalPages}
            pathname={props.base}
            query={{ tab: 'builds' }}
          />
        </>
      )}
    </section>
  );
}
