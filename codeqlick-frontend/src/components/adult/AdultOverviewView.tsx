import appStyles from '@/components/app/app.module.css';
import { Badge } from '@/components/ui/Badge';
import { ADULT_APP_NAMES } from '@/lib/adult';
import type { AdultUserOverview } from '@/lib/api/adult';
import styles from './AdultAdmin.module.css';

export type Translate = (key: string, values?: Record<string, string | number>) => string;

type ViewProps = {
  data: AdultUserOverview;
  t: Translate;
  /** Formats an ISO date for the admin's language. */
  date: (iso: string) => string;
  /** The heading's id, when a page shows two panels. */
  headingId?: string;
};

/**
 * The "Across the 18+ apps" panel (architecture 4.16): per app whether the person entered, their
 * name there, the reports they received and made, their suspensions, how many people blocked
 * them, the shared suspensions and the one verification with its history. Presentational: the
 * texts and the date format come from the caller.
 */
export function AdultOverviewView({ data, t, date, headingId = 'adult-overview' }: ViewProps) {
  const none = '—';
  const verification = data.verification;
  return (
    <section className={appStyles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={appStyles.panelTitle}>
        {t('panel.title')}
      </h2>
      <p className={appStyles.muted}>{t('panel.lead')}</p>

      <ul className={styles.apps}>
        {data.apps.map((app) => {
          const received = app.reportsReceived;
          const reasons = Object.entries(received.byReason).filter(([, count]) => count > 0);
          return (
            <li key={app.app} className={styles.app} data-app={app.app}>
              <h3 className={appStyles.updateTitle}>{ADULT_APP_NAMES[app.app]}</h3>
              {app.enteredAt ? (
                <>
                  <p>{t('panel.entered', { date: date(app.enteredAt) })}</p>
                  <p>{t('panel.nameHere', { name: app.name ?? none })}</p>
                </>
              ) : (
                <p className={appStyles.muted}>{t('panel.notEntered')}</p>
              )}
              <p>
                {t('panel.received', {
                  open: received.open,
                  actioned: received.actioned,
                  dismissed: received.dismissed,
                })}
              </p>
              {reasons.length > 0 ? (
                <p className={appStyles.muted}>
                  {reasons
                    .map(([reason, count]) => `${t(`categories.${reason}`)} ${count}`)
                    .join(' · ')}
                </p>
              ) : null}
              <p>{t('panel.made', { count: app.reportsMade })}</p>
              {app.suspension ? (
                <p>
                  <Badge tone="danger">{t('panel.suspended')}</Badge>{' '}
                  {app.suspension.shared ? <Badge tone="warning">{t('panel.shared')}</Badge> : null}{' '}
                  {t('panel.since', { date: date(app.suspension.since) })} ·{' '}
                  {app.suspension.until
                    ? t('panel.until', { date: date(app.suspension.until) })
                    : t('durations.permanent')}
                  {app.suspension.category
                    ? ` · ${t(`categories.${app.suspension.category}`)}`
                    : ''}
                  {app.suspension.reason ? ` · ${app.suspension.reason}` : ''}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p>{t('panel.blockedBy', { count: data.blockedBy })}</p>

      <h3 className={appStyles.updateTitle}>{t('panel.sharedTitle')}</h3>
      {data.sharedSuspensions.length === 0 ? (
        <p className={appStyles.muted}>{t('panel.noShared')}</p>
      ) : (
        <ul className={styles.list}>
          {data.sharedSuspensions.map((item) => (
            <li key={item.id}>
              <Badge tone={item.active ? 'danger' : 'neutral'}>
                {item.active ? t('panel.active') : t('panel.lifted')}
              </Badge>{' '}
              <strong>{t(`categories.${item.category}`)}</strong> ·{' '}
              {item.sourceApp ? t('panel.from', { app: ADULT_APP_NAMES[item.sourceApp] }) : none} ·{' '}
              {date(item.createdAt)} ·{' '}
              {item.until ? t('panel.until', { date: date(item.until) }) : t('durations.permanent')}
              {item.by ? ` · ${t('panel.by', { name: item.by.name })}` : ''}
              {item.reason ? ` · ${item.reason}` : ''}
              {item.liftedAt
                ? ` · ${t('panel.liftedOn', {
                    date: date(item.liftedAt),
                    name: item.liftedBy?.name ?? none,
                  })}${item.liftReason ? ` (${item.liftReason})` : ''}`
                : ''}
            </li>
          ))}
        </ul>
      )}

      <h3 className={appStyles.updateTitle}>{t('panel.verificationTitle')}</h3>
      {!verification || verification.status === 'NONE' ? (
        <p className={appStyles.muted}>{t('panel.noVerification')}</p>
      ) : (
        <>
          <p>
            <Badge tone={verification.status === 'APPROVED' ? 'success' : 'neutral'}>
              {t(`panel.verificationStatus.${verification.status}`)}
            </Badge>
            {verification.sourceApp
              ? ` · ${t('panel.from', { app: ADULT_APP_NAMES[verification.sourceApp] })}`
              : ''}
            {verification.verifiedName
              ? ` · ${t('panel.verifiedName', { name: verification.verifiedName })}`
              : ''}
            {verification.sentAt
              ? ` · ${t('panel.sent', { date: date(verification.sentAt) })}`
              : ''}
            {verification.decidedAt
              ? ` · ${t('panel.decided', { date: date(verification.decidedAt) })}`
              : ''}
          </p>
          {verification.history.length > 0 ? (
            <ul className={styles.list}>
              {verification.history.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  {date(entry.at)} · {entry.action}
                  {entry.by ? ` · ${entry.by}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
