import { PageHeader } from '@/components/ui/PageHeader';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { MonitorStatus, SlowBadge } from '@/components/cloud/MonitorStatus';
import { ResponseStats } from '@/components/cloud/ResponseStats';
import { formatUptime, UptimeBars } from '@/components/cloud/UptimeBars';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMonitor, getCloudTeam, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import {
  deleteMonitorAction,
  saveMonitorTextAction,
  toggleMonitorAction,
  updateMonitorSlowAction,
} from '../../../../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string; team: string; id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.monitors' });
  return { title: t('title') };
}

/** A monitor: state, 90 days of uptime, the last day's checks, incidents, and its controls. */
export default async function CloudMonitorPage({ params }: PageProps) {
  const { locale: raw, team: slug, id } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let data;
  try {
    data = await Promise.all([getCloudTeam(slug), getCloudMonitor(id)]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [team, monitor] = data;
  const admin = team.role !== 'MEMBER';
  // A monitor tied to a project can also alert that project's channels (decision 64).
  const project = monitor.projectId
    ? await listCloudProjects(team.slug)
        .then((result) => result.items.find((item) => item.id === monitor.projectId) ?? null)
        .catch(() => null)
    : null;
  // The chart's top is the slowest check, or the threshold when that is higher.
  const slowest = Math.max(1, monitor.slowMs ?? 0, ...monitor.checks.map((c) => c.responseMs ?? 0));
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="team" value={team.slug} />
      <input type="hidden" name="id" value={monitor.id} />
    </>
  );

  return (
    <div className={styles.landing}>
      <PageHeader
        back={{ href: `/cloud/console/${team.slug}/monitors`, label: t('monitors.title') }}
        title={monitor.name}
      >
        <p className={styles.rowTitle}>
          <MonitorStatus status={monitor.status} label={t(`monitors.states.${monitor.status}`)} />
          {monitor.slowSince ? <SlowBadge label={t('monitors.slow')} /> : null}
          <span className={styles.small}>
            {t('monitors.since', { when: formatWhen(monitor.statusSince, locale) })}
          </span>
        </p>
        {monitor.slowSince ? (
          <p className={styles.small}>
            {t('monitors.slowSince', { when: formatWhen(monitor.slowSince, locale) })}
          </p>
        ) : null}
        {monitor.lastError ? <p className={styles.small}>{monitor.lastError}</p> : null}
        {project ? (
          <p className={styles.spacedSmall}>
            {t.rich('monitors.projectChannels', {
              project: project.name,
              link: (chunks) => (
                <Link href={`/cloud/console/${team.slug}/${project.slug}?tab=notifications`}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : null}
      </PageHeader>

      {monitor.kind === 'HTTP' ? (
        <div className={appUi.card}>
          <p className={`${styles.mono}`}>{monitor.url}</p>
          {monitor.keyword ? (
            <p className={styles.small}>
              {t(`monitors.textChecks.${monitor.keywordMode}`, { text: monitor.keyword })}
            </p>
          ) : null}
          <p className={styles.small}>
            {monitor.lastCheckedAt
              ? t('monitors.lastCheck', { when: formatWhen(monitor.lastCheckedAt, locale) })
              : t('monitors.noCheck')}
            {monitor.certExpiresAt
              ? ` · ${t('monitors.cert', { when: formatWhen(monitor.certExpiresAt, locale) })}`
              : ''}
          </p>
        </div>
      ) : (
        <div className={appUi.card}>
          <p className={styles.muted}>
            {t('monitors.heartbeatHelp', {
              period: monitor.periodMinutes ?? 0,
              grace: monitor.graceMinutes ?? 0,
            })}
          </p>
          {monitor.heartbeatUrl ? (
            <>
              <CopyLink
                url={monitor.heartbeatUrl}
                labels={{ copy: t('common.copy'), copied: t('common.copied') }}
              />
              <pre className={styles.terminal}>
                <span className={styles.comment}># {t('monitors.curlOk')}</span>
                {`\ncurl -fsS ${monitor.heartbeatUrl}\n`}
                <span className={styles.comment}># {t('monitors.curlFail')}</span>
                {`\ncurl -fsS "${monitor.heartbeatUrl}?status=fail"`}
              </pre>
            </>
          ) : null}
          <p className={styles.small}>
            {monitor.lastPingAt
              ? t('monitors.lastPing', { when: formatWhen(monitor.lastPingAt, locale) })
              : t('monitors.noPing')}
            {monitor.deadlineAt && monitor.enabled
              ? ` · ${t('monitors.deadline', { when: formatWhen(monitor.deadlineAt, locale) })}`
              : ''}
          </p>
        </div>
      )}

      {admin && monitor.kind === 'HTTP' ? (
        <section className={`${appUi.card} ${styles.narrow}`} aria-labelledby="text-title">
          <h2 id="text-title" className={appUi.cardTitle}>
            {t('monitors.textTitle')}
          </h2>
          <ActionForm
            action={saveMonitorTextAction.bind(null, locale, team.slug, monitor.id)}
            className={styles.form}
          >
            <FormInput
              name="keyword"
              label={t('monitors.text')}
              hint={t('monitors.textEditHint')}
              maxLength={100}
              defaultValue={monitor.keyword ?? ''}
            />
            <FormSelect
              name="keywordMode"
              label={t('monitors.textMode')}
              defaultValue={monitor.keywordMode}
              options={[
                { value: 'CONTAINS', label: t('monitors.textModes.CONTAINS') },
                { value: 'NOT_CONTAINS', label: t('monitors.textModes.NOT_CONTAINS') },
              ]}
            />
            <div className={appUi.actions}>
              <SubmitButton pendingLabel={t('monitors.textSaving')}>
                {t('monitors.textSave')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      <section className={appUi.card} aria-labelledby="uptime-title">
        <h2 id="uptime-title" className={appUi.cardTitle}>
          {t('monitors.uptime', { value: formatUptime(monitor.uptime30, locale) })}
        </h2>
        <UptimeBars days={monitor.days} locale={locale} label={t('monitors.uptime90')} />
        <p className={styles.small}>{t('monitors.uptime90')}</p>
      </section>

      {monitor.kind === 'HTTP' && monitor.slowMs && monitor.checks.length === 0 ? (
        <p className={styles.small}>{t('monitors.slowLimitPlain', { ms: monitor.slowMs })}</p>
      ) : null}

      {monitor.kind === 'HTTP' && monitor.responseStats ? (
        <section className={appUi.card} aria-labelledby="response-title">
          <h2 id="response-title" className={appUi.cardTitle}>
            {t('monitors.responseTime')}
          </h2>
          <ResponseStats
            locale={locale}
            stats={monitor.responseStats}
            labels={{
              group: t('monitors.responseWindow'),
              windows: {
                '24h': t('monitors.windows.24h'),
                '7d': t('monitors.windows.7d'),
                '30d': t('monitors.windows.30d'),
              },
              median: t('monitors.responseMedian'),
              p95: t('monitors.responseP95'),
              average: t('monitors.responseAverage'),
              empty: t('monitors.responseEmpty'),
              basedOn: {
                '24h': t('monitors.responseBased', {
                  count: monitor.responseStats['24h']?.checks ?? 0,
                }),
                '7d': t('monitors.responseBased', {
                  count: monitor.responseStats['7d']?.checks ?? 0,
                }),
                '30d': t('monitors.responseBased', {
                  count: monitor.responseStats['30d']?.checks ?? 0,
                }),
              },
            }}
          />
        </section>
      ) : null}

      {monitor.kind === 'HTTP' && monitor.checks.length > 0 ? (
        <section className={appUi.card} aria-labelledby="checks-title">
          <h2 id="checks-title" className={appUi.cardTitle}>
            {t('monitors.checks')}
          </h2>
          {monitor.slowMs ? (
            <p className={styles.small}>{t('monitors.slowLimit', { ms: monitor.slowMs })}</p>
          ) : null}
          <div className={styles.spark} aria-hidden="true">
            {monitor.slowMs ? (
              <span
                className={styles.sparkLimit}
                style={{ bottom: `${Math.round((monitor.slowMs / slowest) * 100)}%` }}
              />
            ) : null}
            {monitor.checks.map((check) => (
              <span
                key={check.at}
                className={check.ok ? styles.sparkOk : styles.sparkBad}
                style={{
                  height: `${Math.max(8, Math.round(((check.responseMs ?? slowest) / slowest) * 100))}%`,
                }}
                title={`${formatWhen(check.at, locale)} · ${check.ok ? `${check.responseMs ?? '—'} ms` : (check.error ?? '')}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {monitor.kind === 'HTTP' && admin ? (
        <section className={`${appUi.card} ${styles.narrow}`} aria-labelledby="slow-title">
          <h2 id="slow-title" className={appUi.cardTitle}>
            {t('monitors.slowTitle')}
          </h2>
          <ActionForm
            action={updateMonitorSlowAction.bind(null, locale, team.slug, monitor.id)}
            className={styles.form}
          >
            <FormInput
              name="slowMs"
              type="number"
              min={500}
              max={14000}
              step={1}
              label={t('monitors.slowLabel')}
              hint={t('monitors.slowHint')}
              defaultValue={monitor.slowMs ?? ''}
            />
            <div className={appUi.actions}>
              <SubmitButton pendingLabel={t('monitors.saving')}>{t('monitors.save')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      <section aria-labelledby="incidents-title">
        <h2 id="incidents-title" className={appUi.sectionTitle}>
          {t('monitors.incidents')}
        </h2>
        {monitor.incidents.length === 0 ? (
          <p className={styles.muted}>{t('monitors.noIncidents')}</p>
        ) : (
          <ul className={styles.list}>
            {monitor.incidents.map((incident) => (
              <li key={incident.start} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {formatWhen(incident.start, locale)}
                    <span className={styles.small}>
                      {incident.end
                        ? t('monitors.lasted', { minutes: incident.minutes })
                        : t('monitors.ongoing')}
                    </span>
                  </p>
                  {incident.error ? <p className={styles.small}>{incident.error}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin ? (
        <div className={appUi.actions}>
          <form action={toggleMonitorAction}>
            {hidden}
            <input type="hidden" name="enabled" value={monitor.enabled ? 'off' : 'on'} />
            <SubmitButton variant="outline">
              {monitor.enabled ? t('monitors.pause') : t('monitors.resume')}
            </SubmitButton>
          </form>
          <form action={deleteMonitorAction}>
            {hidden}
            <SubmitButton variant="ghost">{t('monitors.delete')}</SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
