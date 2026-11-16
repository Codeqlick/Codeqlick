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
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  getAdminCruisingOverview,
  listAdminCruisingMedia,
  listAdminCruisingReports,
  listAdminCruisingSpots,
  listAdminCruisingSuspensions,
  listAdminCruisingTakedowns,
  listAdminCruisingVerifications,
  type AdminCruisingSpot,
} from '@/lib/api/cruising';
import { reportedCommunityTarget } from '@/lib/cruising-community';
import { reportedMedia, type MediaSummary } from '@/lib/cruising-media';
import { SWIPE_COUNTRIES } from '@/lib/countries';
import {
  ALL_REPORT_REASONS,
  countryName,
  formatRating,
  LIMITS,
  osmLink,
  reportedNickname,
  reportTranscript,
  SPOT_TYPES,
  summarizeReportTarget,
  SUSPENSIONS,
  type CruisingReportReason,
  type CruisingSpotStatus,
  type CruisingSpotType,
} from '@/lib/cruising';
import { firstParam, formatDate, formatDateTime } from '@/lib/format';
import { webappUrl } from '@/lib/webapp-seo';
import {
  createSpotAction,
  editSpotAction,
  importSpotsAction,
  liftAction,
  mediaAction,
  reportAction,
  spotAction,
  takedownAction,
  verificationAction,
  withdrawVerificationAction,
  withdrawVerificationByIdAction,
} from './actions';
import admin from './cruising-admin.module.css';
import { SpotExtraFields } from '@/components/cruising/SpotExtraFields';
import { SpotImport } from './SpotImport';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    status?: string | string[];
    q?: string | string[];
    queue?: string | string[];
  }>;
};

const TABS = [
  'queue',
  'media',
  'verifications',
  'reports',
  'takedowns',
  'live',
  'suspended',
  'add',
] as const;
type Tab = (typeof TABS)[number];
/** The live tab's filter: what is published, hidden, rejected in review, or removed by moderation. */
/** The new-media tab's filter: not reviewed yet, hidden while a report is open, or everything. */
const MEDIA_QUEUES = ['new', 'hidden', 'all'] as const;
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
  const tg = await getTranslations({ locale, namespace: 'Cruising.tags' });
  const requested = firstParam(query.tab);
  const tab: Tab = TABS.find((value) => value === requested) ?? 'queue';
  const liveFilter = LIVE_FILTERS.find((value) => value === firstParam(query.status)) ?? 'LIVE';
  const search = (firstParam(query.q) ?? '').trim();
  const mediaQueue = MEDIA_QUEUES.find((value) => value === firstParam(query.queue)) ?? 'new';
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
    ALL_REPORT_REASONS.find((value) => value === reason)
      ? tr(reason as CruisingReportReason)
      : reason;
  const types = SPOT_TYPES.map((value) => ({ value, label: tt(value) }));

  const cards = [
    { label: t('stats.pendingSpots'), value: overview.pendingSpots },
    { label: t('stats.newMedia'), value: overview.newMedia ?? 0 },
    { label: t('stats.pendingVerifications'), value: overview.pendingVerifications ?? 0 },
    { label: t('stats.openReports'), value: overview.openReports },
    { label: t('stats.openTakedowns'), value: overview.openTakedowns },
    { label: t('stats.liveSpots'), value: overview.liveSpots },
    { label: t('stats.liveMedia'), value: overview.liveMedia ?? 0 },
    { label: t('stats.members'), value: overview.members },
    { label: t('stats.reviews'), value: overview.reviews },
    { label: t('stats.suspended'), value: overview.suspended },
    { label: t('stats.activeCheckIns'), value: overview.activeCheckIns ?? 0 },
    { label: t('stats.conversations'), value: overview.conversations ?? 0 },
  ];

  /** A photo or video as the team sees it: the file, or a video's poster with the player. */
  const adminFile = (kind: 'file' | 'poster' | 'verification', id: string) =>
    `/${locale}/admin/cruising/media/${kind}/${id}`;
  const preview = (media: MediaSummary) =>
    media.kind === 'VIDEO' ? (
      // Members' own clips, no captions exist: the team only watches them to moderate.
      // oxlint-disable-next-line jsx-a11y/media-has-caption
      <video
        className={admin.preview}
        src={adminFile('file', media.id)}
        poster={adminFile('poster', media.id)}
        controls
        preload="none"
        playsInline
        aria-label={t('media.videoAlt', { ref: media.ref })}
      />
    ) : (
      // A private image through the BFF route: next/image can't optimise it.
      // oxlint-disable-next-line nextjs/no-img-element
      <img
        className={admin.preview}
        src={adminFile('file', media.id)}
        alt={t('media.photoAlt', { ref: media.ref })}
        loading="lazy"
      />
    );

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
      {spot.tags?.length ? (
        <p className={styles.muted}>
          {ts('tags')}: {spot.tags.map((tag) => tg(tag)).join(' · ')}
        </p>
      ) : null}
      {spot.openingHours ? (
        <p className={styles.muted}>
          {ts('openingHours')}: {spot.openingHours}
        </p>
      ) : null}
      {spot.tips ? (
        <p className={styles.muted}>
          {ts('tips')}: {spot.tips}
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
          <SpotExtraFields
            locale={locale}
            idPrefix={`edit-${spot.id}`}
            defaults={{ tags: spot.tags, openingHours: spot.openingHours, tips: spot.tips }}
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
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Link
            href="/admin/cruising/health"
            className={buttonClassName({ variant: 'outline', size: 'sm' })}
          >
            {t('healthLink')}
          </Link>
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

      {tab === 'media' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('media.title')}</h2>
          <p className={styles.muted}>{t('media.lead')}</p>
          <nav className={styles.actions} aria-label={t('media.filter')}>
            {MEDIA_QUEUES.map((value) => (
              <Link
                key={value}
                href={`/admin/cruising?tab=media&queue=${value}`}
                className={buttonClassName({
                  variant: value === mediaQueue ? 'primary' : 'outline',
                  size: 'sm',
                })}
                aria-current={value === mediaQueue ? 'page' : undefined}
              >
                {t(`media.queues.${value}`)}
              </Link>
            ))}
          </nav>
          {(await listAdminCruisingMedia(mediaQueue)).map((item) => (
            <article key={item.id} className={admin.item}>
              {preview(item)}
              <div className={admin.body}>
                <p>
                  <strong>{item.owner.nickname ?? item.owner.name}</strong>{' '}
                  {item.owner.verified ? <Badge tone="success">{t('media.verified')}</Badge> : null}{' '}
                  {item.owner.suspended ? (
                    <Badge tone="danger">{t('media.suspended')}</Badge>
                  ) : null}{' '}
                  · {item.owner.email}
                </p>
                <p className={styles.muted}>
                  {t(`media.kind.${item.kind}`)} · <code>{item.ref}</code> ·{' '}
                  <Badge tone={item.status === 'LIVE' ? 'success' : 'neutral'}>
                    {t(`media.status.${item.status}`)}
                  </Badge>{' '}
                  · {t('sent', { date: formatDateTime(item.createdAt, locale) })} ·{' '}
                  {t('openReports', { count: item.openReports })}
                  {item.durationSeconds !== null
                    ? ` · ${t('media.duration', { seconds: Math.round(item.durationSeconds) })}`
                    : ''}
                  {item.reviewedAt
                    ? ` · ${t('media.reviewedOn', { date: formatDate(item.reviewedAt, locale) })}`
                    : ''}
                </p>
                {item.failure ? (
                  <p className={styles.muted}>
                    {t('media.failure')}: {item.failure}
                  </p>
                ) : null}
                <ActionForm
                  action={mediaAction.bind(null, locale, item.id)}
                  className={styles.form}
                >
                  <FormInput
                    id={`media-reason-${item.id}`}
                    name="reason"
                    label={t('media.reason')}
                    hint={t('media.reasonHint')}
                    maxLength={LIMITS.rejectReason}
                  />
                  <FormCheckbox
                    id={`media-block-${item.id}`}
                    name="blockHash"
                    label={t('media.blockHash')}
                    defaultChecked
                  />
                  <FormSelect
                    id={`media-suspend-${item.id}`}
                    name="suspend"
                    label={t('reports.suspend')}
                    options={durations}
                    defaultValue=""
                  />
                  <FormCheckbox
                    id={`media-withdraw-${item.id}`}
                    name="withdrawVerification"
                    label={t('media.withdraw')}
                  />
                  <div className={styles.actions}>
                    <SubmitButton size="sm" variant="outline" name="decision" value="reviewed">
                      {t('media.reviewed')}
                    </SubmitButton>
                    <SubmitButton size="sm" variant="danger" name="decision" value="remove">
                      {t('media.remove')}
                    </SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'verifications' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('verifications.title')}</h2>
          <p className={styles.muted}>{t('verifications.lead')}</p>
          {(await listAdminCruisingVerifications()).map((item) => (
            <article key={item.userId} className={admin.item}>
              {/* oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route */}
              <img
                className={admin.preview}
                src={adminFile('verification', item.userId)}
                alt={t('verifications.alt')}
              />
              <div className={admin.body}>
                <p>
                  <strong>{item.nickname ?? item.name}</strong> · {item.name} · {item.email}
                </p>
                <p className={styles.muted}>
                  {t('verifications.memberSince', { date: formatDate(item.memberSince, locale) })} ·{' '}
                  {t('sent', { date: formatDateTime(item.sentAt, locale) })}
                </p>
                <p className={styles.muted}>
                  {t('verifications.check', { nickname: item.nickname ?? '' })}
                </p>
                <ActionForm
                  action={verificationAction.bind(null, locale, item.userId)}
                  className={styles.form}
                >
                  <FormInput
                    id={`verification-note-${item.userId}`}
                    name="note"
                    label={t('verifications.note')}
                    hint={t('verifications.noteHint')}
                    maxLength={LIMITS.rejectReason}
                  />
                  <div className={styles.actions}>
                    <SubmitButton size="sm" name="decision" value="approve">
                      {t('verifications.approve')}
                    </SubmitButton>
                    <SubmitButton size="sm" variant="outline" name="decision" value="reject">
                      {t('verifications.reject')}
                    </SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </article>
          ))}
          <h3 className={styles.panelTitle}>{t('verifications.withdrawTitle')}</h3>
          <p className={styles.muted}>{t('verifications.withdrawLead')}</p>
          <ActionForm
            action={withdrawVerificationByIdAction.bind(null, locale)}
            className={styles.form}
          >
            <FormInput id="withdraw-user-id" name="userId" label={t('verifications.userId')} />
            <SubmitButton size="sm" variant="outline">
              {t('verifications.withdraw')}
            </SubmitButton>
          </ActionForm>
        </section>
      ) : null}

      {tab === 'reports' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.reports')}</h2>
          {(await listAdminCruisingReports('OPEN')).map((report) => {
            const target = summarizeReportTarget(report.target);
            const profileNickname =
              report.targetType === 'PROFILE' ? reportedNickname(report.target) : null;
            const savedChat = reportTranscript(report.transcript);
            const media = report.targetType === 'MEDIA' ? reportedMedia(report.target) : null;
            const transcript = savedChat.length > 0 ? savedChat : reportTranscript(report.target);
            const community =
              report.targetType === 'MEETUP' || report.targetType === 'ALERT'
                ? reportedCommunityTarget(report.target)
                : null;
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
                  {community ? (
                    community.spotName || community.title || community.text ? (
                      <>
                        {community.spotName ? (
                          <p>
                            {t('reportedSpot')}: <strong>{community.spotName}</strong>
                            {community.spotSlug ? (
                              <>
                                {' · '}
                                <a
                                  href={webappUrl(
                                    'cruising',
                                    locale,
                                    `/spots/${community.spotSlug}`,
                                  )}
                                >
                                  {t('viewPage')}
                                </a>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {community.title || community.kind ? (
                          <p>
                            <strong>{community.title ?? community.kind}</strong>
                          </p>
                        ) : null}
                        {community.text ? (
                          <blockquote className={admin.quote}>{community.text}</blockquote>
                        ) : null}
                      </>
                    ) : (
                      <p className={styles.muted}>{t('communityGone')}</p>
                    )
                  ) : null}
                  {report.targetType === 'MEDIA' ? (
                    media ? (
                      <>
                        {preview(media)}
                        <p>
                          {t('media.title')}: <code>{media.ref}</code> ·{' '}
                          {t(`media.status.${media.status}`)}
                        </p>
                      </>
                    ) : (
                      <p className={styles.muted}>{t('media.gone')}</p>
                    )
                  ) : null}
                  {profileNickname ? (
                    <p>
                      {t('reportedProfile')}: <strong>{profileNickname}</strong>
                    </p>
                  ) : null}
                  {report.targetType === 'CONVERSATION' ? (
                    transcript.length > 0 ? (
                      <ol className={admin.transcript} aria-label={t('transcript')}>
                        {transcript.map((line) => (
                          <li key={`${line.at ?? ''}-${line.from}-${line.text}`}>
                            <strong>
                              {line.from === 'reporter'
                                ? t('reporter')
                                : line.from === 'reported'
                                  ? t('reported')
                                  : '—'}
                              :
                            </strong>{' '}
                            {line.text}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.muted}>{t('noTranscript')}</p>
                    )
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
                      {report.reported.verified ? ` · ${t('media.verified')}` : ''}
                      {report.reported.userId ? ` · ${report.reported.userId}` : ''}
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
                    <FormCheckbox
                      id={`withdraw-${report.id}`}
                      name="withdrawVerification"
                      label={t('media.withdraw')}
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
                {request.media ? (
                  <>
                    {preview(request.media)}
                    <p className={styles.muted}>
                      {t('takedowns.mediaMatched', {
                        ref: request.media.ref,
                        status: t(`media.status.${request.media.status}`),
                      })}
                    </p>
                  </>
                ) : request.mediaRef ? (
                  <p className={styles.muted}>
                    {t('takedowns.mediaUnmatched', { ref: request.mediaRef })}
                  </p>
                ) : (
                  <p className={styles.muted}>
                    {request.spot
                      ? t('takedowns.matched', { name: request.spot.name })
                      : t('takedowns.unmatched', { link: request.spotLink ?? '—' })}
                  </p>
                )}
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
                    <SubmitButton
                      size="sm"
                      name="decision"
                      value="remove"
                      disabled={!request.spot && !request.media}
                    >
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

      {tab === 'add' ? (
        <>
          <section className={styles.panel} aria-labelledby="add-one-title">
            <h2 id="add-one-title" className={styles.panelTitle}>
              {t('add.oneTitle')}
            </h2>
            <p className={styles.muted}>{t('add.oneLead')}</p>
            <ActionForm action={createSpotAction.bind(null, locale)} className={styles.form}>
              <FormInput
                id="add-name"
                name="name"
                label={ts('name')}
                hint={ts('nameHint')}
                maxLength={LIMITS.name}
                required
              />
              <FormSelect
                id="add-type"
                name="type"
                label={ts('type')}
                placeholder={ts('typePlaceholder')}
                options={types}
                defaultValue=""
                required
              />
              <FormInput
                id="add-lat"
                name="lat"
                label={ts('lat')}
                hint={ts('latHint')}
                inputMode="decimal"
                required
              />
              <FormInput
                id="add-lng"
                name="lng"
                label={ts('lng')}
                hint={ts('lngHint')}
                inputMode="decimal"
                required
              />
              <FormSelect
                id="add-countryCode"
                name="countryCode"
                label={ts('country')}
                placeholder={ts('countryPlaceholder')}
                options={countries}
                defaultValue=""
                required
              />
              <FormInput
                id="add-city"
                name="city"
                label={ts('city')}
                maxLength={LIMITS.city}
                required
              />
              <FormTextarea
                id="add-description"
                name="description"
                label={ts('description')}
                hint={ts('descriptionHint')}
                rows={5}
                maxLength={LIMITS.description}
                required
              />
              <FormInput
                id="add-bestTimes"
                name="bestTimes"
                label={ts('bestTimes')}
                hint={ts('bestTimesHint')}
                optionalLabel={ts('optional')}
                maxLength={LIMITS.bestTimes}
              />
              <SpotExtraFields locale={locale} idPrefix="add" />
              <FormCheckbox
                id="add-publish"
                name="publish"
                label={t('add.publish')}
                hint={t('add.publishHint')}
                defaultChecked
              />
              <SubmitButton size="sm" pendingLabel={ts('sending')}>
                {t('add.create')}
              </SubmitButton>
            </ActionForm>
          </section>
          <section className={styles.panel} aria-labelledby="add-import-title">
            <h2 id="add-import-title" className={styles.panelTitle}>
              {t('add.importTitle')}
            </h2>
            <ClientMessages extra={APP_NAMESPACES.admin}>
              <SpotImport
                action={importSpotsAction.bind(null, locale)}
                typeLabels={
                  Object.fromEntries(types.map((type) => [type.value, type.label])) as Record<
                    CruisingSpotType,
                    string
                  >
                }
              />
            </ClientMessages>
          </section>
        </>
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
                {item.verified ? (
                  <ActionForm action={withdrawVerificationAction.bind(null, locale, item.userId)}>
                    <SubmitButton size="sm" variant="outline">
                      {t('verifications.withdraw')}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
