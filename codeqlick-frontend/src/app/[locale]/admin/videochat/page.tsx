import { getTranslations } from 'next-intl/server';
import { ActionForm, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  getVideochatStats,
  listVideochatAppeals,
  listVideochatReports,
  listVideochatSuspensions,
  SUSPENSION_DURATIONS,
  type ReportStatus,
} from '@/lib/api/videochat';
import { firstParam, formatDate, formatDateTime } from '@/lib/format';
import {
  bulkReportsAction,
  dismissReportAction,
  liftSuspensionAction,
  resolveAppealAction,
  suspendReportAction,
} from './actions';
import { ModerationKeys } from './ModerationKeys';
import moderation from './moderation.module.css';

const BULK_FORM = 'bulk-reports';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string | string[] }>;
};

const STATUSES: ReportStatus[] = ['OPEN', 'ACTIONED', 'DISMISSED'];

/** Video chat moderation: who is online, reports to review, suspended accounts. */
export default async function AdminVideochatPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminVideochat' });
  const th = await getTranslations({ locale, namespace: 'AdminVideochat.personHistory' });
  const requested = firstParam((await searchParams).status);
  const status = STATUSES.find((value) => value === requested) ?? 'OPEN';
  const [stats, reports, suspensions, appeals] = await Promise.all([
    getVideochatStats(),
    listVideochatReports(status),
    listVideochatSuspensions(),
    listVideochatAppeals('OPEN'),
  ]);
  const durations = SUSPENSION_DURATIONS.map((value) => ({
    value,
    label: t(`durations.${value}`),
  }));
  const userLink = (id: string) => `/admin/videochat/users/${id}`;

  const cards = [
    { label: t('online'), value: stats.online },
    { label: t('waiting'), value: stats.waiting },
    { label: t('calls'), value: stats.calls },
  ];

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/admin/videochat/stats" variant="outline" size="sm">
            {t('statsLink')}
          </Button>
        }
      />

      <ul className={styles.stats}>
        {cards.map((card) => (
          <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
            <span className={styles.statValue}>{card.value}</span>
            <span className={styles.statLabel}>{card.label}</span>
          </li>
        ))}
      </ul>

      <nav className={styles.actions} aria-label={t('title')}>
        {STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin/videochat?status=${value}`}
            aria-current={value === status ? 'page' : undefined}
          >
            {value === status ? <strong>{t(`tabs.${value}`)}</strong> : t(`tabs.${value}`)}
          </Link>
        ))}
      </nav>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t(`tabs.${status}`)}</h2>
        {reports.length === 0 ? (
          <p className={styles.muted}>{t('empty')}</p>
        ) : (
          <>
            {status === 'OPEN' ? (
              <ActionForm
                id={BULK_FORM}
                action={bulkReportsAction.bind(null, locale)}
                className={moderation.bulk}
              >
                <ModerationKeys
                  form={BULK_FORM}
                  labels={{
                    title: t('keys.title'),
                    selectAll: t('bulk.selectAll'),
                    j: t('keys.next'),
                    k: t('keys.previous'),
                    x: t('keys.select'),
                    d: t('keys.dismiss'),
                    s: t('keys.suspend'),
                    o: t('keys.open'),
                    '?': t('keys.help'),
                  }}
                />
                <FormSelect
                  name="duration"
                  label={t('duration')}
                  options={durations}
                  defaultValue="permanent"
                />
                <SubmitButton size="sm" variant="danger" name="bulkAction" value="suspend">
                  {t('bulk.suspend')}
                </SubmitButton>
                <SubmitButton size="sm" variant="outline" name="bulkAction" value="dismiss">
                  {t('bulk.dismiss')}
                </SubmitButton>
              </ActionForm>
            ) : null}
            <ul className={styles.updates}>
              {reports.map((report) => {
                const history = report.reported.history;
                return (
                  <li
                    key={report.id}
                    className={`${styles.update} ${moderation.report}`}
                    data-report
                    tabIndex={-1}
                  >
                    <div className={moderation.reportMain}>
                      <h3 className={styles.updateTitle}>
                        {report.status === 'OPEN' ? (
                          <label className={moderation.pick}>
                            <input
                              type="checkbox"
                              name="ids"
                              value={report.id}
                              form={BULK_FORM}
                              data-shortcut="select"
                              aria-label={t('bulk.pick', {
                                reason: t(`reasons.${report.reason}`),
                                name: report.reported.name,
                              })}
                            />
                          </label>
                        ) : null}
                        {t(`reasons.${report.reason}`)}{' '}
                        {report.reason === 'MINOR' ? <Badge tone="danger">!</Badge> : null}
                      </h3>
                      <p className={styles.muted}>
                        {formatDateTime(report.createdAt, locale)} · {t('reportedBy')}{' '}
                        {report.reporter.name} ({report.reporter.email})
                      </p>
                      <p>
                        <strong>{t('reportedUser')}:</strong>{' '}
                        <Link href={userLink(report.reported.id)} data-shortcut="open">
                          {report.reported.name}
                        </Link>{' '}
                        ({report.reported.email}) ·{' '}
                        {t('recent', { count: report.reported.recentReports })}{' '}
                        {report.reported.suspendedAt ? (
                          <Badge tone="danger">{t('suspendedBadge')}</Badge>
                        ) : null}
                      </p>
                      {report.details ? (
                        <p className={styles.prewrap}>
                          <strong>{t('details')}:</strong> {report.details}
                        </p>
                      ) : null}
                      <details>
                        <summary>{t('transcript')}</summary>
                        {report.transcript.length === 0 ? (
                          <p className={styles.muted}>{t('noTranscript')}</p>
                        ) : (
                          <ul>
                            {report.transcript.map((line, index) => (
                              <li key={`${line.at}-${index}`}>
                                <strong>
                                  {line.from === 'reporter' ? t('fromReporter') : t('fromReported')}
                                  :
                                </strong>{' '}
                                {line.text}
                              </li>
                            ))}
                          </ul>
                        )}
                      </details>
                      {report.reviewedBy ? (
                        <p className={styles.muted}>
                          {t('reviewedBy', { name: report.reviewedBy.name })} ·{' '}
                          {formatDateTime(report.reviewedAt, locale)}
                        </p>
                      ) : null}
                      {report.status === 'OPEN' ? (
                        <div className={styles.actions}>
                          <ActionForm
                            action={suspendReportAction.bind(null, locale, report.id)}
                            className={styles.row}
                          >
                            <FormSelect
                              name="duration"
                              label={t('duration')}
                              options={durations}
                              defaultValue="permanent"
                            />
                            <SubmitButton size="sm" variant="danger" shortcut="suspend">
                              {t('suspend')}
                            </SubmitButton>
                          </ActionForm>
                          <ActionForm action={dismissReportAction.bind(null, locale, report.id)}>
                            <SubmitButton size="sm" variant="outline" shortcut="dismiss">
                              {t('dismiss')}
                            </SubmitButton>
                          </ActionForm>
                        </div>
                      ) : null}
                    </div>
                    {history ? (
                      <aside className={moderation.history} aria-label={th('title')}>
                        <h4 className={moderation.historyTitle}>{th('title')}</h4>
                        <dl>
                          <dt>{th('memberSince')}</dt>
                          <dd>{formatDate(history.memberSince, locale)}</dd>
                          <dt>{th('open')}</dt>
                          <dd>{history.reports.open}</dd>
                          <dt>{th('actioned')}</dt>
                          <dd>{history.reports.actioned}</dd>
                          <dt>{th('dismissed')}</dt>
                          <dd>{history.reports.dismissed}</dd>
                          <dt>{th('reporters')}</dt>
                          <dd>{history.reporters}</dd>
                          <dt>{th('suspensions')}</dt>
                          <dd>{history.suspensions}</dd>
                        </dl>
                        {history.lastSuspension ? (
                          <p className={moderation.historyNote}>
                            {th('last', {
                              date: formatDate(history.lastSuspension.createdAt, locale),
                              reason: history.lastSuspension.reason ?? '—',
                            })}
                          </p>
                        ) : null}
                      </aside>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('appealsTitle')}</h2>
        {appeals.length === 0 ? (
          <p className={styles.muted}>{t('noAppeals')}</p>
        ) : (
          <ul className={styles.updates}>
            {appeals.map((appeal) => (
              <li key={appeal.id} className={styles.update}>
                <p>
                  <Link href={userLink(appeal.user.id)}>
                    <strong>{appeal.user.name}</strong>
                  </Link>{' '}
                  ({appeal.user.email}) · {formatDateTime(appeal.createdAt, locale)}
                </p>
                <p className={styles.muted}>
                  {t('appealFor', {
                    reason: appeal.sanction.reason ?? '—',
                    until: appeal.sanction.until
                      ? formatDateTime(appeal.sanction.until, locale)
                      : t('durations.permanent'),
                  })}
                </p>
                <p className={styles.prewrap}>{appeal.message}</p>
                <ActionForm
                  action={resolveAppealAction.bind(null, locale, appeal.id)}
                  className={styles.form}
                >
                  <FormTextarea name="response" label={t('appealResponse')} rows={2} />
                  <div className={styles.actions}>
                    <SubmitButton size="sm" name="decision" value="accept">
                      {t('appealAccept')}
                    </SubmitButton>
                    <SubmitButton size="sm" variant="outline" name="decision" value="reject">
                      {t('appealReject')}
                    </SubmitButton>
                  </div>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('suspensionsTitle')}</h2>
        {suspensions.length === 0 ? (
          <p className={styles.muted}>{t('noSuspensions')}</p>
        ) : (
          <ul className={styles.updates}>
            {suspensions.map((suspension) => (
              <li key={suspension.user.id} className={styles.update}>
                <p>
                  <Link href={userLink(suspension.user.id)}>
                    <strong>{suspension.user.name}</strong>
                  </Link>{' '}
                  ({suspension.user.email}) · {formatDateTime(suspension.suspendedAt, locale)} ·{' '}
                  {suspension.until
                    ? t('until', { date: formatDateTime(suspension.until, locale) })
                    : t('durations.permanent')}
                </p>
                {suspension.reason ? <p className={styles.muted}>{suspension.reason}</p> : null}
                <div className={styles.actions}>
                  <ActionForm action={liftSuspensionAction.bind(null, locale, suspension.user.id)}>
                    <SubmitButton size="sm" variant="outline">
                      {t('lift')}
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
