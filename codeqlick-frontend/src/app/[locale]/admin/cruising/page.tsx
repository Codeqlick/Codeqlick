import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  getAdminCruisingOverview,
  listAdminCruisingReports,
  listAdminCruisingSpots,
  listAdminCruisingSuspensions,
  listAdminCruisingTakedowns,
  type AdminCruisingSpot,
} from '@/lib/api/cruising';
import { SWIPE_COUNTRIES } from '@/lib/countries';
import {
  countryName,
  formatRating,
  LIMITS,
  osmLink,
  REPORT_REASONS,
  SPOT_TYPES,
  summarizeReportTarget,
  SUSPENSIONS,
  type CruisingReportReason,
  type CruisingSpotStatus,
} from '@/lib/cruising';
import { firstParam, formatDate, formatDateTime } from '@/lib/format';
import { webappUrl } from '@/lib/webapp-seo';
import { editSpotAction, liftAction, reportAction, spotAction, takedownAction } from './actions';
import admin from './cruising-admin.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    status?: string | string[];
    q?: string | string[];
  }>;
};

const TABS = ['queue', 'reports', 'takedowns', 'live', 'suspended'] as const;
type Tab = (typeof TABS)[number];
/** The live tab's filter: what is published, hidden, rejected in review, or removed by moderation. */
const LIVE_FILTERS = ['LIVE', 'HIDDEN', 'REJECTED', 'REMOVED'] as const;

const TONES: Record<CruisingSpotStatus, BadgeTone> = {
  PENDING: 'warning',
  LIVE: 'success',
  REJECTED: 'danger',
  HIDDEN: 'neutral',
  REMOVED: 'danger',
};

/** Cruising's moderation: every spot waits here before it goes live. */
export default async function AdminCruisingPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'AdminCruising' });
  const tr = await getTranslations({ locale, namespace: 'Cruising.report.reasons' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const ts = await getTranslations({ locale, namespace: 'Cruising.spotForm' });
  const requested = firstParam(query.tab);
  const tab: Tab = TABS.find((value) => value === requested) ?? 'queue';
  const liveFilter = LIVE_FILTERS.find((value) => value === firstParam(query.status)) ?? 'LIVE';
  const search = (firstParam(query.q) ?? '').trim();
  const overview = await getAdminCruisingOverview();
  const durations = [
    { value: '', label: t('noSuspension') },
    ...SUSPENSIONS.map((value) => ({ value, label: t(`durations.${value}`) })),
  ];
  const countries = SWIPE_COUNTRIES.map((code) => ({
    value: code,
    label: countryName(code, locale),
  })).toSorted((a, b) => a.label.localeCompare(b.label, locale));
  /** The reasons the report form offers; a removal request's reason may be another word. */
  const reasonLabel = (reason: string) =>
    REPORT_REASONS.find((value) => value === reason) ? tr(reason as CruisingReportReason) : reason;
  const types = SPOT_TYPES.map((value) => ({ value, label: tt(value) }));

  const cards = [
    { label: t('stats.pendingSpots'), value: overview.pendingSpots },
    { label: t('stats.openReports'), value: overview.openReports },
    { label: t('stats.openTakedowns'), value: overview.openTakedowns },
    { label: t('stats.liveSpots'), value: overview.liveSpots },
    { label: t('stats.members'), value: overview.members },
    { label: t('stats.reviews'), value: overview.reviews },
    { label: t('stats.suspended'), value: overview.suspended },
  ];

  /** One spot's facts, as the team needs them to decide. */
  const facts = (spot: AdminCruisingSpot) => (
    <>
      <p>
        <strong>{spot.name}</strong> · {tt(spot.type)} · {spot.city},{' '}
        {countryName(spot.countryCode, locale)}{' '}
        <Badge tone={TONES[spot.status]}>{t(`status.${spot.status}`)}</Badge>
      </p>
      <p className={styles.muted}>
        {spot.createdBy ? `${spot.createdBy.name} · ${spot.createdBy.email}` : t('noProposer')} ·{' '}
        {t('sent', { date: formatDateTime(spot.createdAt, locale) })} ·{' '}
        {t('openReports', { count: spot.openReports })}
        {spot.ratingCount > 0 ? ` · ${formatRating(spot.ratingAvg)} (${spot.ratingCount})` : ''}
      </p>
      <p className={styles.prewrap}>{spot.description}</p>
      {spot.bestTimes ? (
        <p className={styles.muted}>
          {t('bestTimes')}: {spot.bestTimes}
        </p>
      ) : null}
      {spot.rejectReason ? (
        <p className={styles.muted}>
          {t('rejectedBecause')}: {spot.rejectReason}
        </p>
      ) : null}
      <p>
        <a href={osmLink(spot.lat, spot.lng)} target="_blank" rel="noopener noreferrer">
          {t('checkOnMap')}
        </a>{' '}
        ({spot.lat}, {spot.lng})
        {spot.status === 'LIVE' ? (
          <>
            {' · '}
            <a href={webappUrl('cruising', locale, `/spots/${spot.slug}`)}>{t('viewPage')}</a>
          </>
        ) : null}
      </p>
    </>
  );

  /** The team's corrections: the same fields as the proposal. */
  const editForm = (spot: AdminCruisingSpot) => {
    const id = (name: string) => `edit-${spot.id}-${name}`;
    return (
      <details className={admin.edit}>
        <summary>{t('edit')}</summary>
        <ActionForm action={editSpotAction.bind(null, locale, spot.id)} className={styles.form}>
          <FormInput
            id={id('name')}
            name="name"
            label={ts('name')}
            maxLength={LIMITS.name}
            defaultValue={spot.name}
          />
          <FormSelect
            id={id('type')}
            name="type"
            label={ts('type')}
            options={types}
            defaultValue={spot.type}
          />
          <FormInput
            id={id('lat')}
            name="lat"
            label={ts('lat')}
            inputMode="decimal"
            defaultValue={String(spot.lat)}
          />
          <FormInput
            id={id('lng')}
            name="lng"
            label={ts('lng')}
            inputMode="decimal"
            defaultValue={String(spot.lng)}
          />
          <FormSelect
            id={id('countryCode')}
            name="countryCode"
            label={ts('country')}
            options={countries}
            defaultValue={spot.countryCode}
          />
          <FormInput
            id={id('city')}
            name="city"
            label={ts('city')}
            maxLength={LIMITS.city}
            defaultValue={spot.city}
          />
          <FormTextarea
            id={id('description')}
            name="description"
            label={ts('description')}
            rows={5}
            maxLength={LIMITS.description}
            defaultValue={spot.description}
          />
          <FormInput
            id={id('bestTimes')}
            name="bestTimes"
            label={ts('bestTimes')}
            maxLength={LIMITS.bestTimes}
            defaultValue={spot.bestTimes ?? ''}
          />
          <SubmitButton size="sm" variant="outline">
            {t('saveEdit')}
          </SubmitButton>
        </ActionForm>
      </details>
    );
  };

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />

      <ul className={styles.stats}>
        {cards.map((card) => (
          <li key={card.label} className={`${styles.panel} ${styles.stat}`}>
            <span className={styles.statValue}>{card.value}</span>
            <span className={styles.statLabel}>{card.label}</span>
          </li>
        ))}
      </ul>

      <div className={styles.panel} role="note">
        <strong>{t('ruleTitle')}</strong> {t('rule')}
      </div>

      <nav className={styles.actions} aria-label={t('title')}>
        {TABS.map((value) => (
          <Link
            key={value}
            href={`/admin/cruising?tab=${value}`}
            className={buttonClassName({
              variant: value === tab ? 'primary' : 'outline',
              size: 'sm',
            })}
            aria-current={value === tab ? 'page' : undefined}
          >
            {t(`tabs.${value}`)}
          </Link>
        ))}
      </nav>

      {tab === 'queue' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('queue.title')}</h2>
          <p className={styles.muted}>{t('queue.lead')}</p>
          {(await listAdminCruisingSpots('PENDING')).map((spot) => (
            <article key={spot.id} className={admin.item}>
              <div className={admin.body}>
                {facts(spot)}
                {editForm(spot)}
                <ActionForm action={spotAction.bind(null, locale, spot.id)} className={styles.form}>
                  <FormInput
                    id={`reject-${spot.id}`}
                    name="reason"
                    label={t('queue.reason')}
                    hint={t('queue.reasonHint')}
                    maxLength={LIMITS.rejectReason}
                  />
                  <div className={styles.actions}>
                    <SubmitButton size="sm" name="decision" value="approve">
                      {t('publish')}
                    </SubmitButton>
                    <SubmitButton size="sm" variant="outline" name="decision" value="reject">
                      {t('reject')}
                    </SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'reports' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.reports')}</h2>
          {(await listAdminCruisingReports('OPEN')).map((report) => {
            const target = summarizeReportTarget(report.target);
            return (
              <article key={report.id} className={admin.item}>
                <div className={admin.body}>
                  <p>
                    <strong>{reasonLabel(report.reason)}</strong> ·{' '}
                    {t(`targets.${report.targetType}`)} · {formatDateTime(report.createdAt, locale)}
                  </p>
                  {target.spotName ? (
                    <p>
                      {t('reportedSpot')}: <strong>{target.spotName}</strong>
                      {target.spotSlug ? (
                        <>
                          {' · '}
                          <a href={webappUrl('cruising', locale, `/spots/${target.spotSlug}`)}>
                            {t('viewPage')}
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {target.reviewText || target.reviewRating ? (
                    <blockquote className={admin.quote}>
                      {target.reviewRating ? `${'★'.repeat(target.reviewRating)} ` : ''}
                      {target.reviewText}
                    </blockquote>
                  ) : null}
                  {report.details ? <p className={styles.prewrap}>{report.details}</p> : null}
                  {report.reporter ? (
                    <p className={styles.muted}>
                      {t('reporter')}: {report.reporter.name ?? '—'} · {report.reporter.email ?? ''}
                    </p>
                  ) : null}
                  {report.reported ? (
                    <p className={styles.muted}>
                      {t('reported')}: {report.reported.name ?? '—'} · {report.reported.email ?? ''}
                      {report.reported.reports === undefined
                        ? ''
                        : ` · ${t('reportsAgainst', { count: report.reported.reports })}`}
                    </p>
                  ) : null}
                  <ActionForm
                    action={reportAction.bind(null, locale, report.id)}
                    className={styles.form}
                  >
                    <FormCheckbox
                      id={`remove-${report.id}`}
                      name="remove"
                      label={t('reports.remove')}
                    />
                    <FormInput
                      id={`reason-${report.id}`}
                      name="reason"
                      label={t('reports.reason')}
                      hint={t('reports.reasonHint')}
                      maxLength={LIMITS.rejectReason}
                    />
                    <FormSelect
                      id={`suspend-${report.id}`}
                      name="suspend"
                      label={t('reports.suspend')}
                      options={durations}
                      defaultValue=""
                    />
                    <div className={styles.actions}>
                      <SubmitButton size="sm" name="decision" value="act">
                        {t('reports.act')}
                      </SubmitButton>
                      <SubmitButton size="sm" variant="outline" name="decision" value="dismiss">
                        {t('reports.dismiss')}
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {tab === 'takedowns' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.takedowns')}</h2>
          <p className={styles.muted}>{t('takedowns.lead')}</p>
          {(await listAdminCruisingTakedowns('OPEN')).map((request) => (
            <article key={request.id} className={admin.item}>
              <div className={admin.body}>
                <p>
                  <strong>{reasonLabel(request.reason)}</strong> ·{' '}
                  {formatDateTime(request.createdAt, locale)} · {request.email}
                </p>
                <p className={styles.muted}>
                  {request.spot
                    ? t('takedowns.matched', { name: request.spot.name })
                    : t('takedowns.unmatched', { link: request.spotLink ?? '—' })}
                </p>
                <p className={styles.prewrap}>{request.details}</p>
                <ActionForm
                  action={takedownAction.bind(null, locale, request.id)}
                  className={styles.form}
                >
                  <FormTextarea
                    id={`response-${request.id}`}
                    name="response"
                    label={t('takedowns.response')}
                    rows={3}
                    maxLength={2000}
                  />
                  <div className={styles.actions}>
                    <SubmitButton size="sm" name="decision" value="remove" disabled={!request.spot}>
                      {t('takedowns.remove')}
                    </SubmitButton>
                    <SubmitButton size="sm" variant="outline" name="decision" value="close">
                      {t('takedowns.close')}
                    </SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'live' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.live')}</h2>
          <nav className={styles.actions} aria-label={t('live.filter')}>
            {LIVE_FILTERS.map((value) => (
              <Link
                key={value}
                href={`/admin/cruising?tab=live&status=${value}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
                className={buttonClassName({
                  variant: value === liveFilter ? 'primary' : 'outline',
                  size: 'sm',
                })}
                aria-current={value === liveFilter ? 'page' : undefined}
              >
                {t(`status.${value}`)}
              </Link>
            ))}
          </nav>
          <search>
            <form method="get" className={admin.filters}>
              <input type="hidden" name="tab" value="live" />
              <input type="hidden" name="status" value={liveFilter} />
              <FormInput
                id="cruising-search"
                name="q"
                type="search"
                label={t('live.search')}
                defaultValue={search}
              />
              <SubmitButton size="sm" variant="outline">
                {t('live.searchButton')}
              </SubmitButton>
            </form>
          </search>
          {(await listAdminCruisingSpots(liveFilter, search || undefined)).map((spot) => (
            <article key={spot.id} className={admin.item}>
              <div className={admin.body}>
                {facts(spot)}
                {editForm(spot)}
                <ActionForm action={spotAction.bind(null, locale, spot.id)} className={styles.form}>
                  {spot.status === 'LIVE' ? (
                    <SubmitButton size="sm" variant="outline" name="decision" value="hide">
                      {t('hide')}
                    </SubmitButton>
                  ) : (
                    <SubmitButton size="sm" name="decision" value="approve">
                      {t('publish')}
                    </SubmitButton>
                  )}
                </ActionForm>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'suspended' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.suspended')}</h2>
          {(await listAdminCruisingSuspensions()).map((item) => (
            <article key={item.userId} className={admin.item}>
              <div className={admin.body}>
                <p>
                  <strong>{item.nickname ?? item.name}</strong> · {item.email}
                </p>
                <p className={styles.muted}>
                  {item.reason ?? '—'} ·{' '}
                  {item.until ? formatDateTime(item.until, locale) : t('durations.permanent')}
                  {item.suspendedAt ? ` · ${formatDate(item.suspendedAt, locale)}` : ''}
                </p>
                <ActionForm action={liftAction.bind(null, locale, item.userId)}>
                  <SubmitButton size="sm" variant="outline">
                    {t('lift')}
                  </SubmitButton>
                </ActionForm>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
