import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import {
  getCloudTeam,
  listCloudDeployments,
  listCloudDomains,
  listCloudProjects,
  type CloudDomainState,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import {
  addressHref,
  formatBytes,
  formatWhen,
  isProtected,
  type ProtectionMode,
} from '@/lib/cloud';
import { appPath } from '@/lib/webapp-request';
import {
  addDomainAction,
  checkDomainAction,
  deleteDeploymentAction,
  deleteProjectAction,
  promoteAction,
  removeDomainAction,
  renameProjectAction,
} from '../../../actions';
import styles from '../../../cloud.module.css';
import { env } from '@/lib/env';
import { ANALYTICS_PERIODS, AnalyticsTab } from './AnalyticsTab';
import { BuildsTab } from './BuildsTab';
import { DatabasesTab } from './DatabasesTab';
import { FormsTab } from './FormsTab';
import { GitTab } from './GitTab';
import { KvTab } from './KvTab';
import { StorageTab } from './StorageTab';
import { TransferProject } from './TransferProject';
import { NotificationsTab } from './NotificationsTab';
import { ProtectionCard, ProtectionLock } from './ProtectionCard';

const TABS = [
  'deployments',
  'builds',
  'git',
  'notifications',
  'analytics',
  'kv',
  'databases',
  'storage',
  'domains',
  'forms',
  'settings',
] as const;
type Tab = (typeof TABS)[number];
type PageProps = {
  params: Promise<{ locale: AppLocale; team: string; project: string }>;
  searchParams: Promise<{
    tab?: string;
    page?: string;
    form?: string;
    q?: string;
    github?: string;
    period?: string;
    prefix?: string;
    cursor?: string;
    key?: string;
    moved?: string;
    git?: string;
  }>;
};

const STATE_TONE: Record<CloudDomainState, BadgeTone> = {
  PENDING: 'warning',
  VERIFIED: 'warning',
  LIVE: 'success',
  ERROR: 'danger',
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { project } = await params;
  return { title: project };
}

async function load(teamSlug: string, projectSlug: string) {
  try {
    const [team, { items }] = await Promise.all([
      getCloudTeam(teamSlug),
      listCloudProjects(teamSlug),
    ]);
    const project = items.find((item) => item.slug === projectSlug);
    if (!project) notFound();
    return { team, project };
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

/** A project: its deployments (publish, delete), its domains and its settings. */
export default async function CloudProjectPage({ params, searchParams }: PageProps) {
  const { locale: raw, team: teamSlug, project: projectSlug } = await params;
  const query = await searchParams;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const { team, project } = await load(teamSlug, projectSlug);
  const tab: Tab = TABS.find((key) => key === query.tab) ?? 'deployments';
  const period = ANALYTICS_PERIODS.find((key) => key === query.period) ?? '7d';
  const page = Math.max(1, Number(query.page) || 1);
  const base = `/cloud/console/${team.slug}/${project.slug}`;
  const path = `/${team.slug}/${project.slug}`;
  const admin = team.role !== 'MEMBER';
  const open = await appPath(`/${locale}/cloud/console${path}/open`, locale);

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}`}>← {team.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>{project.name}</h1>
        <div className={styles.address}>
          <CopyLink
            url={project.url}
            labels={{ copy: t('common.copy'), copied: t('common.copied') }}
          />
          {isProtected(project.protection, 'production') ? (
            <ProtectionLock label={t('protection.locked')} />
          ) : null}
        </div>
        <nav className={`${styles.tabs} ${styles.spacedTabs}`} aria-label={project.name}>
          {TABS.map((key) => (
            <Link
              key={key}
              href={key === 'deployments' ? base : `${base}?tab=${key}`}
              className={styles.tab}
              aria-current={tab === key ? 'page' : undefined}
            >
              {t(`project.tabs.${key}`)}
            </Link>
          ))}
        </nav>
      </div>

      {query.moved === '1' ? (
        <Alert tone="success">
          {t('project.transfer.moved')}
          {query.git === 'dropped' ? ` ${t('project.transfer.gitDropped')}` : ''}
        </Alert>
      ) : null}

      {project.suspended ? (
        <Alert tone="error">
          <strong>{t('project.suspendedTitle')}.</strong>{' '}
          {t('project.suspendedBody', { reason: project.suspended.reason })}
        </Alert>
      ) : null}

      {tab === 'deployments' ? (
        <Deployments
          locale={locale}
          projectId={project.id}
          projectSlug={project.slug}
          teamSlug={team.slug}
          path={path}
          page={page}
          base={base}
          protection={project.protection}
          open={open}
        />
      ) : null}
      {tab === 'domains' ? (
        <Domains
          locale={locale}
          projectId={project.id}
          path={path}
          protection={project.protection}
        />
      ) : null}
      {tab === 'git' ? (
        <GitTab
          locale={locale}
          teamSlug={team.slug}
          projectId={project.id}
          projectSlug={project.slug}
          path={path}
          admin={admin}
          github={query.github}
        />
      ) : null}
      {tab === 'builds' ? (
        <BuildsTab
          locale={locale}
          teamSlug={team.slug}
          projectId={project.id}
          projectSlug={project.slug}
          base={base}
          page={page}
        />
      ) : null}
      {tab === 'notifications' ? (
        <NotificationsTab
          locale={locale}
          teamSlug={team.slug}
          projectId={project.id}
          path={path}
          admin={admin}
        />
      ) : null}
      {tab === 'analytics' ? (
        <AnalyticsTab
          locale={locale}
          projectId={project.id}
          path={path}
          base={base}
          admin={admin}
          period={period}
        />
      ) : null}
      {tab === 'kv' ? (
        <KvTab
          locale={locale}
          projectId={project.id}
          projectSlug={project.slug}
          path={path}
          base={base}
          apiUrl={env.PUBLIC_API_URL}
          prefix={query.prefix?.slice(0, 256) || undefined}
          cursor={query.cursor?.slice(0, 256) || undefined}
          selected={query.key?.slice(0, 256) || undefined}
        />
      ) : null}
      {tab === 'databases' ? (
        <DatabasesTab locale={locale} projectId={project.id} path={path} admin={admin} />
      ) : null}
      {tab === 'storage' ? (
        <StorageTab locale={locale} projectId={project.id} path={path} admin={admin} />
      ) : null}
      {tab === 'forms' ? (
        <FormsTab
          locale={locale}
          teamSlug={team.slug}
          projectId={project.id}
          projectSlug={project.slug}
          path={path}
          base={base}
          admin={admin}
          formId={query.form}
          q={query.q?.trim().slice(0, 100) || undefined}
          page={page}
        />
      ) : null}
      {tab === 'settings' ? (
        <>
          <section className={`${styles.card} ${styles.narrow}`}>
            <h2 className={styles.cardTitle}>{t('project.badgeTitle')}</h2>
            <p className={styles.muted}>{t('project.badgeHelp')}</p>
            <CopyLink
              url={`[![Codeqlick](${env.PUBLIC_API_URL}/cloud/badges/${project.slug}.svg)](${project.url})`}
              labels={{ copy: t('common.copy'), copied: t('common.copied') }}
            />
          </section>
          {admin ? (
            <section className={`${styles.card} ${styles.narrow}`}>
              <ActionForm
                action={renameProjectAction.bind(null, locale, path, project.id)}
                className={styles.form}
              >
                <FormInput
                  name="name"
                  label={t('team.projectName')}
                  defaultValue={project.name}
                  required
                  maxLength={60}
                />
                <div className={styles.actions}>
                  <SubmitButton variant="outline" pendingLabel={tc('saving')}>
                    {t('project.rename')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </section>
          ) : null}
          <ProtectionCard locale={locale} projectId={project.id} path={path} admin={admin} />
          {team.role === 'OWNER' ? (
            <TransferProject
              locale={locale}
              teamSlug={team.slug}
              projectId={project.id}
              projectSlug={project.slug}
            />
          ) : null}
          {admin ? (
            <section className={`${styles.card} ${styles.narrow} ${styles.danger}`}>
              <h2 className={styles.cardTitle}>{t('project.deleteTitle')}</h2>
              <p className={styles.muted}>{t('project.deleteBody')}</p>
              <ActionForm
                action={deleteProjectAction.bind(null, locale, team.slug, project.id, project.slug)}
                className={styles.form}
              >
                <FormInput
                  name="confirm"
                  label={tc('confirmType', { text: project.slug })}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <div className={styles.actions}>
                  <SubmitButton variant="danger" pendingLabel={tc('deleting')}>
                    {tc('delete')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </section>
          ) : (
            <p className={styles.muted}>{t('common.noPermission')}</p>
          )}
        </>
      ) : null}
    </div>
  );
}

async function Deployments({
  locale,
  projectId,
  projectSlug,
  teamSlug,
  path,
  page,
  base,
  protection,
  open,
}: {
  locale: AppLocale;
  projectId: string;
  projectSlug: string;
  teamSlug: string;
  path: string;
  page: number;
  base: string;
  protection: ProtectionMode;
  /** The console's route that opens a protected address with a ticket. */
  open: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const list = await listCloudDeployments(projectId, page).catch(() => null);
  const archive = await appPath(
    `/${locale}/cloud/console/${teamSlug}/${projectSlug}/deployments`,
    locale,
  );
  return (
    <section aria-labelledby="deployments-title" className={styles.landing}>
      <div className={styles.card}>
        <p className={styles.muted}>{t('project.deployHelp')}</p>
        <pre className={styles.terminal}>
          <span className={styles.prompt}>$ </span>
          {`npx @codeqlick/cli deploy dist --prod --team ${teamSlug} --project ${projectSlug}`}
        </pre>
      </div>
      <h2 id="deployments-title" className={styles.sectionTitle}>
        {t('project.tabs.deployments')}
      </h2>
      {list === null ? (
        <p className={styles.muted}>{t('common.loadError')}</p>
      ) : list.items.length === 0 ? (
        <p className={styles.muted}>{t('project.deploymentsEmpty')}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {list.items.map((deployment) => (
              <li key={deployment.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <Link href={`${base}/deployments/${deployment.id}`} className={styles.mono}>
                      {deployment.shortId}
                    </Link>
                    {deployment.isProduction ? (
                      <Badge tone="success">{t('project.productionTag')}</Badge>
                    ) : (
                      <Badge>{t('project.preview')}</Badge>
                    )}
                    {deployment.rules ? <Badge>{t('project.rules.badge')}</Badge> : null}
                    {deployment.message ? <span>{deployment.message}</span> : null}
                  </p>
                  <span className={styles.address}>
                    <a
                      href={addressHref(protection, 'previews', deployment.url, open)}
                      className={`${styles.small} ${styles.mono}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {deployment.url.replace('https://', '')}
                    </a>
                    {isProtected(protection, 'previews') ? (
                      <ProtectionLock label={t('protection.locked')} />
                    ) : null}
                  </span>
                  <p className={styles.small}>
                    {formatWhen(deployment.createdAt, locale)}
                    {deployment.createdBy ? ` · ${deployment.createdBy.name}` : ''}
                    {deployment.viaToken
                      ? ` · ${t('project.via', { token: deployment.viaToken })}`
                      : ''}
                    {' · '}
                    {formatBytes(deployment.sizeBytes, locale)}
                    {' · '}
                    {t('project.files', { count: deployment.fileCount })}
                    {deployment.commit ? ` · ${deployment.commit.slice(0, 7)}` : ''}
                    {deployment.branch ? ` (${deployment.branch})` : ''}
                  </p>
                </div>
                <div className={styles.actions}>
                  <a href={`${archive}/${deployment.id}/archive`} className={styles.small}>
                    {t('project.download')}
                    <span className="visually-hidden"> — {deployment.shortId}</span>
                  </a>
                  <div className={styles.actions}>
                  <Button href={`${base}/deployments/${deployment.id}`} size="sm" variant="ghost">
                    {t('deployment.tabs.files')}
                    <span className="visually-hidden"> — {deployment.shortId}</span>
                  </Button>
                  {deployment.isProduction ? null : (
                    <>
                      <form action={promoteAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="project" value={projectId} />
                        <input type="hidden" name="id" value={deployment.id} />
                        <input type="hidden" name="path" value={path} />
                        <SubmitButton size="sm" variant="outline">
                          {t('project.promote')}
                        </SubmitButton>
                      </form>
                      <form action={deleteDeploymentAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="project" value={projectId} />
                        <input type="hidden" name="id" value={deployment.id} />
                        <input type="hidden" name="path" value={path} />
                        <SubmitButton size="sm" variant="ghost">
                          {t('project.delete')}
                          <span className="visually-hidden"> — {deployment.shortId}</span>
                        </SubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={list.page} totalPages={list.totalPages} pathname={base} />
        </>
      )}
    </section>
  );
}

async function Domains({
  locale,
  projectId,
  path,
  protection,
}: {
  locale: AppLocale;
  projectId: string;
  path: string;
  protection: ProtectionMode;
}) {
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const domains = await listCloudDomains(projectId)
    .then((result) => result.items)
    .catch(() => null);
  return (
    <section aria-labelledby="domains-title" className={styles.landing}>
      <div className={`${styles.card} ${styles.narrow}`}>
        <h2 id="domains-title" className={styles.cardTitle}>
          {t('project.tabs.domains')}
        </h2>
        <p className={styles.muted}>{t('project.domainsLead')}</p>
        <ActionForm
          action={addDomainAction.bind(null, locale, path, projectId)}
          className={styles.form}
        >
          <FormInput
            name="name"
            label={t('project.domainName')}
            hint={t('project.domainHint')}
            required
            autoCapitalize="none"
            spellCheck={false}
            mono
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('project.adding')}>{t('project.add')}</SubmitButton>
          </div>
        </ActionForm>
      </div>
      {domains === null ? (
        <p className={styles.muted}>{t('common.loadError')}</p>
      ) : domains.length === 0 ? (
        <p className={styles.muted}>{t('project.domainsEmpty')}</p>
      ) : (
        <ul className={styles.list}>
          {domains.map((domain) => (
            <li key={domain.id} className={`${styles.card}`}>
              <p className={styles.rowTitle}>
                <span className={styles.mono}>{domain.name}</span>
                {isProtected(protection, 'production') ? (
                  <ProtectionLock label={t('protection.locked')} />
                ) : null}
                <Badge tone={STATE_TONE[domain.state]}>{t(`common.states.${domain.state}`)}</Badge>
              </p>
              {domain.lastError ? <p className={styles.small}>{domain.lastError}</p> : null}
              {domain.state !== 'LIVE' ? (
                <>
                  <p className={styles.small}>{t('project.dnsTitle')}</p>
                  <div className={styles.dnsWrap}>
                    <table className={styles.dns}>
                      <thead>
                        <tr>
                          <th scope="col">{t('project.record')}</th>
                          <th scope="col">{t('project.host')}</th>
                          <th scope="col">{t('project.value')}</th>
                          <th scope="col">
                            <span className="visually-hidden">OK</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {domain.dns.map((record) => (
                          <tr key={record.type}>
                            <td>{record.type}</td>
                            <td>{record.name}</td>
                            <td>{record.value}</td>
                            <td className={styles.ok}>{record.ok ? '✓' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <div className={styles.actions}>
                {domain.checkedAt ? (
                  <span className={styles.small}>
                    {t('project.checkedAt', { when: formatWhen(domain.checkedAt, locale) })}
                  </span>
                ) : null}
                <form action={checkDomainAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="project" value={projectId} />
                  <input type="hidden" name="id" value={domain.id} />
                  <input type="hidden" name="path" value={path} />
                  <SubmitButton size="sm" variant="outline">
                    {t('project.check')}
                  </SubmitButton>
                </form>
                <form action={removeDomainAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="project" value={projectId} />
                  <input type="hidden" name="id" value={domain.id} />
                  <input type="hidden" name="path" value={path} />
                  <SubmitButton size="sm" variant="ghost">
                    {t('project.remove')}
                    <span className="visually-hidden"> — {domain.name}</span>
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
