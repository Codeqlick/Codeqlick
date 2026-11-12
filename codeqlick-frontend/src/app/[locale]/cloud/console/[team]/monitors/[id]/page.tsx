import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CopyLink } from '@/components/app/CopyLink';
import { MonitorStatus } from '@/components/cloud/MonitorStatus';
import { formatUptime, UptimeBars } from '@/components/cloud/UptimeBars';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMonitor, getCloudTeam } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import { deleteMonitorAction, toggleMonitorAction } from '../../../../actions';
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
  const slowest = Math.max(1, ...monitor.checks.map((c) => c.responseMs ?? 0));
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="team" value={team.slug} />
      <input type="hidden" name="id" value={monitor.id} />
    </>
  );

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}/monitors`}>← {t('monitors.title')}</Link>
        </p>
        <h1 className={styles.heroTitle}>{monitor.name}</h1>
        <p className={styles.rowTitle}>
          <MonitorStatus status={monitor.status} label={t(`monitors.states.${monitor.status}`)} />
          <span className={styles.small}>
            {t('monitors.since', { when: formatWhen(monitor.statusSince, locale) })}
          </span>
        </p>
        {monitor.lastError ? <p className={styles.small}>{monitor.lastError}</p> : null}
      </div>

      {monitor.kind === 'HTTP' ? (
        <div className={styles.card}>
          <p className={`${styles.mono}`}>{monitor.url}</p>
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
        <div className={styles.card}>
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

      <section className={styles.card} aria-labelledby="uptime-title">
        <h2 id="uptime-title" className={styles.cardTitle}>
          {t('monitors.uptime', { value: formatUptime(monitor.uptime30, locale) })}
        </h2>
        <UptimeBars days={monitor.days} locale={locale} label={t('monitors.uptime90')} />
        <p className={styles.small}>{t('monitors.uptime90')}</p>
      </section>

      {monitor.kind === 'HTTP' && monitor.checks.length > 0 ? (
        <section className={styles.card} aria-labelledby="checks-title">
          <h2 id="checks-title" className={styles.cardTitle}>
            {t('monitors.checks')}
          </h2>
          <div className={styles.spark} role="img" aria-label={t('monitors.checks')}>
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

      <section aria-labelledby="incidents-title">
        <h2 id="incidents-title" className={styles.sectionTitle}>
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
        <div className={styles.actions}>
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
