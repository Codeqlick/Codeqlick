import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, Input } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import {
  adminCloudDisk,
  adminCloudProjects,
  adminCloudReports,
  adminCloudTeams,
} from '@/lib/api/cloud';
import { formatBytes } from '@/lib/cloud';
import { firstParam, formatDateTime } from '@/lib/format';
import { closeReportAction, suspendAction, unsuspendAction } from './actions';

type Tab = 'projects' | 'teams' | 'reports' | 'closed';
type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS: readonly Tab[] = ['projects', 'teams', 'reports', 'closed'];

/** The disk Cloud shares with the platform, and what Cloud keeps on it (decision 49). */
async function Disk({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'AdminCloud.disk' });
  const disk = await adminCloudDisk().catch(() => null);
  if (!disk || disk.totalBytes === null || disk.freeBytes === null || !disk.state) return null;
  const used = Math.round(((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100);
  const tone = disk.state === 'full' ? 'danger' : disk.state === 'low' ? 'warning' : 'success';
  const cards = [
    {
      label: t('free', { total: formatBytes(disk.totalBytes, locale), used }),
      value: formatBytes(disk.freeBytes, locale),
    },
    { label: t('deployments'), value: formatBytes(disk.deploymentsBytes, locale) },
    { label: t('databases'), value: formatBytes(disk.databasesBytes, locale) },
    { label: t('buckets'), value: formatBytes(disk.bucketsBytes, locale) },
  ];
  return (
    <section className={styles.stack} aria-labelledby="disk-title">
      <h2 id="disk-title" className={styles.panelTitle}>
        {t('title')} <Badge tone={tone}>{t(`states.${disk.state}`)}</Badge>
      </h2>
      <ul className={styles.stats}>
        {cards.map((card) => (
          <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
            <span className={styles.statValue}>{card.value}</span>
            <span className={styles.statLabel}>{card.label}</span>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        {t('help', {
          low: formatBytes(disk.lowBytes, locale),
          min: formatBytes(disk.minBytes, locale),
        })}
      </p>
    </section>
  );
}

/** Admin → Cloud (architecture 4.13): teams, projects (suspend, lift) and abuse reports. */
export default async function AdminCloudPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'AdminCloud' });
  const tab = (TABS as readonly string[]).includes(firstParam(query.tab) ?? '')
    ? (firstParam(query.tab) as Tab)
    : 'projects';
  const q = firstParam(query.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Number(firstParam(query.page)) || 1);
  const suspended = firstParam(query.suspended) === 'true' ? true : undefined;

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />
      <Disk locale={locale} />
      <nav className={styles.filters} aria-label={t('title')}>
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === 'projects' ? '/admin/cloud' : `/admin/cloud?tab=${key}`}
            className={buttonClassName({
              variant: key === tab ? 'primary' : 'outline',
              size: 'sm',
            })}
            aria-current={key === tab ? 'page' : undefined}
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </nav>

      {tab === 'projects' || tab === 'teams' ? (
        <form method="get" className={styles.filters}>
          {tab === 'teams' ? <input type="hidden" name="tab" value="teams" /> : null}
          <Input
            name="q"
            type="search"
            label={t('search')}
            placeholder={t('searchPlaceholder')}
            defaultValue={q}
          />
          {tab === 'projects' ? (
            <Checkbox
              name="suspended"
              value="true"
              label={t('suspendedOnly')}
              defaultChecked={suspended}
            />
          ) : null}
          <SubmitButton size="sm" variant="outline">
            {t('search')}
          </SubmitButton>
        </form>
      ) : null}

      {tab === 'projects' ? (
        <Projects locale={locale} q={q} suspended={suspended} page={page} />
      ) : null}
      {tab === 'teams' ? <Teams locale={locale} q={q} page={page} /> : null}
      {tab === 'reports' || tab === 'closed' ? (
        <Reports locale={locale} status={tab === 'closed' ? 'CLOSED' : 'OPEN'} page={page} />
      ) : null}
    </div>
  );
}

async function Projects({
  locale,
  q,
  suspended,
  page,
}: {
  locale: AppLocale;
  q?: string;
  suspended?: boolean;
  page: number;
}) {
  const t = await getTranslations({ locale, namespace: 'AdminCloud' });
  const list = await adminCloudProjects({ q, suspended, page });
  if (list.items.length === 0) return <EmptyState title={t('empty')} />;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.listTable}`}>
          <thead>
            <tr>
              <th scope="col">{t('columns.project')}</th>
              <th scope="col">{t('columns.team')}</th>
              <th scope="col">{t('columns.storage')}</th>
              <th scope="col">{t('columns.deployments')}</th>
              <th scope="col">{t('columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((project) => (
              <tr key={project.id}>
                <th scope="row">
                  <a href={project.url} target="_blank" rel="noreferrer">
                    {project.name}
                  </a>
                  <span className={styles.sub}>{project.url.replace('https://', '')}</span>
                </th>
                <td data-label={t('columns.team')}>{project.team.name}</td>
                <td data-label={t('columns.storage')}>
                  {formatBytes(project.storageBytes, locale)}
                </td>
                <td data-label={t('columns.deployments')}>
                  {project.deployments} · {t('columns.domains')}: {project.domains}
                </td>
                <td data-label={t('columns.status')}>
                  {project.suspendedAt ? (
                    <div className={styles.stack}>
                      <Badge tone="danger">{t('suspended')}</Badge>
                      <span className={styles.sub}>{project.suspendedReason}</span>
                      <form action={unsuspendAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={project.id} />
                        <SubmitButton size="sm" variant="outline">
                          {t('unsuspend')}
                        </SubmitButton>
                      </form>
                    </div>
                  ) : (
                    <details>
                      <summary>{t('suspend')}</summary>
                      <form action={suspendAction} className={styles.form}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={project.id} />
                        <label htmlFor={`reason-${project.id}`}>{t('reason')}</label>
                        <textarea
                          id={`reason-${project.id}`}
                          name="reason"
                          required
                          minLength={5}
                          maxLength={500}
                          rows={3}
                        />
                        <SubmitButton size="sm" variant="danger">
                          {t('suspend')}
                        </SubmitButton>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={list.page}
        totalPages={list.totalPages}
        pathname="/admin/cloud"
        query={{ q, suspended: suspended ? 'true' : undefined }}
      />
    </>
  );
}

async function Teams({ locale, q, page }: { locale: AppLocale; q?: string; page: number }) {
  const t = await getTranslations({ locale, namespace: 'AdminCloud' });
  const list = await adminCloudTeams({ q, page });
  if (list.items.length === 0) return <EmptyState title={t('empty')} />;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.listTable}`}>
          <thead>
            <tr>
              <th scope="col">{t('columns.team')}</th>
              <th scope="col">{t('columns.owners')}</th>
              <th scope="col">{t('columns.projects')}</th>
              <th scope="col">{t('columns.storage')}</th>
              <th scope="col">{t('columns.created')}</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((team) => (
              <tr key={team.id}>
                <th scope="row">
                  {team.name}
                  <span className={styles.sub}>
                    {team.slug} · {team.plan}
                  </span>
                </th>
                <td data-label={t('columns.owners')}>
                  {team.owners.map((owner) => (
                    <Link key={owner.id} href={`/admin/users/${owner.id}`} className={styles.sub}>
                      {owner.email}
                    </Link>
                  ))}
                </td>
                <td data-label={t('columns.projects')}>
                  {team.projects} · {t('columns.members')}: {team.members}
                </td>
                <td data-label={t('columns.storage')}>{formatBytes(team.storageBytes, locale)}</td>
                <td data-label={t('columns.created')}>{formatDateTime(team.createdAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={list.page}
        totalPages={list.totalPages}
        pathname="/admin/cloud"
        query={{ tab: 'teams', q }}
      />
    </>
  );
}

async function Reports({
  locale,
  status,
  page,
}: {
  locale: AppLocale;
  status: 'OPEN' | 'CLOSED';
  page: number;
}) {
  const t = await getTranslations({ locale, namespace: 'AdminCloud' });
  const tr = await getTranslations({ locale, namespace: 'Cloud.report.reasons' });
  const list = await adminCloudReports(status, page);
  if (list.items.length === 0) return <EmptyState title={t('empty')} />;
  return (
    <>
      <ul className={styles.simpleList}>
        {list.items.map((report) => (
          <li key={report.id} className={styles.panel}>
            <p>
              <Badge tone="danger">{tr(report.reason)}</Badge>{' '}
              <a href={report.url} target="_blank" rel="noreferrer nofollow">
                {report.url}
              </a>
            </p>
            <p className={styles.muted}>
              {t('reportFrom', {
                email: report.email,
                when: formatDateTime(report.createdAt, locale),
              })}{' '}
              ·{' '}
              {report.project
                ? t('matched', { project: `${report.project.name} (${report.project.slug})` })
                : t('unmatched')}
              {report.project?.suspended ? ` · ${t('suspended')}` : ''}
            </p>
            <p className={styles.prewrap}>{report.details}</p>
            {status === 'CLOSED' ? (
              <p className={styles.muted}>
                {t('closedNote', {
                  when: report.closedAt ? formatDateTime(report.closedAt, locale) : '—',
                  note: report.note ?? '—',
                })}
              </p>
            ) : (
              <form action={closeReportAction} className={styles.form}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={report.id} />
                <label htmlFor={`note-${report.id}`}>{t('note')}</label>
                <input id={`note-${report.id}`} name="note" maxLength={1000} />
                <div className={styles.actions}>
                  {report.project ? (
                    <Link
                      href={`/admin/cloud?q=${encodeURIComponent(report.project.slug)}`}
                      className={buttonClassName({ variant: 'outline', size: 'sm' })}
                    >
                      {t('suspend')}…
                    </Link>
                  ) : null}
                  <SubmitButton size="sm" variant="outline">
                    {t('close')}
                  </SubmitButton>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
      <Pagination
        page={list.page}
        totalPages={list.totalPages}
        pathname="/admin/cloud"
        query={{ tab: status === 'CLOSED' ? 'closed' : 'reports' }}
      />
    </>
  );
}
