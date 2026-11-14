import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MonitorStatus } from '@/components/cloud/MonitorStatus';
import { formatUptime, UptimeBars } from '@/components/cloud/UptimeBars';
import { Badge } from '@/components/ui/Badge';
import { resolveLocale } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import {
  getCloudPublicStatus,
  type CloudPublicNotice,
  type CloudPublicStatus,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import { groupPublicNotices, noticeTone } from '@/lib/cloud-notices';
import { webappAlternates } from '@/lib/webapp-seo';
import styles from '../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string; team: string }> };

async function load(team: string): Promise<CloudPublicStatus> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(team)) notFound();
  try {
    return await getCloudPublicStatus(team);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, team } = await params;
  const locale = resolveLocale(raw);
  const status = await load(team);
  const t = await getTranslations({ locale, namespace: 'Cloud.status' });
  return {
    title: { absolute: `${status.title} · ${t('suffix')}` },
    description: status.intro ?? t(`overall.${status.overall}`),
    alternates: webappAlternates('cloud', locale, `/status/${team}`),
  };
}

/** A team's public status page (architecture 4.13, decision 39). */
export default async function PublicStatusPage({ params }: PageProps) {
  const { locale: raw, team } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const status = await load(team);
  const groups = groupPublicNotices(status.notices ?? []);
  // Open notices on top: incidents, then maintenance in progress, then upcoming maintenance.
  const current = [...groups.incidents, ...groups.inProgress, ...groups.upcoming];

  return (
    <div className={`${styles.landing} ${styles.docs}`}>
      <div>
        <h1 className={styles.heroTitle}>{status.title}</h1>
        {status.intro ? <p className={styles.muted}>{status.intro}</p> : null}
      </div>
      <p className={`${styles.overall} ${styles[`overall_${status.overall}`]}`}>
        {t(`status.overall.${status.overall}`)}
      </p>
      {current.length > 0 ? (
        <section aria-labelledby="notices-title">
          <h2 id="notices-title" className={styles.sectionTitle}>
            {t('status.notices')}
          </h2>
          <ul className={styles.list}>
            {current.map((notice) => (
              <li key={notice.id} className={styles.card}>
                <NoticeItem notice={notice} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ul className={styles.list}>
        {status.monitors.map((monitor) => (
          <li key={monitor.label} className={styles.card}>
            <p className={styles.rowTitle}>
              {monitor.label}
              <MonitorStatus
                status={monitor.status}
                label={t(`monitors.states.${monitor.status}`)}
              />
              <span className={styles.small}>
                {t('status.uptime', { value: formatUptime(monitor.uptime90, locale) })}
              </span>
            </p>
            <UptimeBars
              days={monitor.days}
              locale={locale}
              label={t('status.uptime', { value: formatUptime(monitor.uptime90, locale) })}
            />
            {monitor.incidents.length > 0 ? (
              <ul className={styles.incidentList}>
                {monitor.incidents.map((incident) => (
                  <li key={incident.start} className={styles.small}>
                    {formatWhen(incident.start, locale)} ·{' '}
                    {incident.end
                      ? t('monitors.lasted', { minutes: incident.minutes })
                      : t('monitors.ongoing')}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {groups.closed.length > 0 ? (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className={styles.sectionTitle}>
            {t('status.history')}
          </h2>
          <ul className={styles.list}>
            {groups.closed.map((notice) => (
              <li key={notice.id} className={styles.card}>
                <NoticeItem notice={notice} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className={styles.small}>
        {t('status.updated', { when: formatWhen(status.updatedAt, locale) })} ·{' '}
        {t('status.poweredBy')}
      </p>
    </div>
  );
}

/**
 * A notice: its state, the monitors it affects, a maintenance's window, the latest update and the
 * full timeline (in a <details>, no script). Bodies are plain text shown with their line breaks.
 */
async function NoticeItem({ notice, locale }: { notice: CloudPublicNotice; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const [latest] = notice.updates;
  const closedAt = notice.resolvedAt ?? (notice.kind === 'MAINTENANCE' ? notice.endsAt : null);
  const label = (state: CloudPublicNotice['updates'][number]['state']) =>
    state ? t(`notices.states.${state}`) : t('notices.note');

  return (
    <>
      <p className={styles.rowTitle}>
        {notice.title}
        <Badge tone={noticeTone(notice.kind, notice.state)}>
          {t(`notices.kinds.${notice.kind}`)} · {t(`notices.states.${notice.state}`)}
        </Badge>
      </p>
      {notice.monitors.length > 0 ? (
        <p className={styles.small}>{t('status.affects', { names: notice.monitors.join(', ') })}</p>
      ) : null}
      {notice.kind === 'MAINTENANCE' && notice.startsAt && notice.endsAt ? (
        <p className={styles.small}>
          {t('status.window', {
            start: formatWhen(notice.startsAt, locale),
            end: formatWhen(notice.endsAt, locale),
          })}
        </p>
      ) : null}
      {latest ? (
        <div>
          <p className={styles.small}>
            {t('status.latest', { when: formatWhen(latest.createdAt, locale) })} ·{' '}
            {label(latest.state)}
          </p>
          <p className={styles.noticeBody}>{latest.body}</p>
        </div>
      ) : null}
      {notice.updates.length > 1 ? (
        <details>
          <summary className={styles.small}>
            {t('status.timeline', { count: notice.updates.length })}
          </summary>
          <ol className={styles.timeline}>
            {notice.updates.map((update, index) => (
              <li key={`${index}-${update.createdAt}`}>
                <p className={styles.small}>
                  {formatWhen(update.createdAt, locale)} · {label(update.state)}
                </p>
                <p className={styles.noticeBody}>{update.body}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {closedAt && (notice.state === 'RESOLVED' || notice.state === 'COMPLETED') ? (
        <p className={styles.small}>{t('status.closed', { when: formatWhen(closedAt, locale) })}</p>
      ) : null}
    </>
  );
}
