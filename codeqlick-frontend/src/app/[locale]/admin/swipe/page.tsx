import { buttonClassName } from '@/components/ui/buttonStyles';
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
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  getAdminSwipeOverview,
  listAdminSwipePhotos,
  listAdminSwipeReports,
  listAdminSwipeSuspensions,
  listAdminSwipeTakedowns,
  listAdminSwipeVerifications,
  SWIPE_SUSPENSIONS,
} from '@/lib/api/swipe';
import { firstParam, formatDate, formatDateTime } from '@/lib/format';
import {
  liftAction,
  photoAction,
  reportAction,
  takedownAction,
  verificationAction,
} from './actions';
import swipe from './swipe-admin.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

const TABS = ['queue', 'reports', 'takedowns', 'live', 'suspended', 'history'] as const;
type Tab = (typeof TABS)[number];

/** Swipe's moderation: nothing goes live before the team approves it. */
export default async function AdminSwipePage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminSwipe' });
  const tr = await getTranslations({ locale, namespace: 'Swipe.report.reasons' });
  const requested = firstParam((await searchParams).tab);
  const tab: Tab = TABS.find((value) => value === requested) ?? 'queue';
  const overview = await getAdminSwipeOverview();
  const img = (kind: 'photo' | 'verification', id: string) =>
    `/${locale}/admin/swipe/img/${kind}/${id}`;
  const durations = [
    { value: '', label: t('noSuspension') },
    ...SWIPE_SUSPENSIONS.map((value) => ({ value, label: t(`durations.${value}`) })),
  ];

  const cards = [
    { label: t('stats.pendingVerifications'), value: overview.pendingVerifications },
    { label: t('stats.pendingPhotos'), value: overview.pendingPhotos },
    { label: t('stats.openReports'), value: overview.openReports },
    { label: t('stats.openTakedowns'), value: overview.openTakedowns },
    { label: t('stats.livePhotos'), value: overview.livePhotos },
    { label: t('stats.members'), value: overview.members },
    { label: t('stats.uploaders'), value: overview.uploaders },
    { label: t('stats.matches'), value: overview.matches },
  ];

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
            href={`/admin/swipe?tab=${value}`}
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
        <>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('verifications.title')}</h2>
            <p className={styles.muted}>{t('verifications.lead')}</p>
            {(await listAdminSwipeVerifications()).map((item) => (
              <article key={item.userId} className={swipe.item}>
                {/* oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route */}
                <img
                  src={img('verification', item.userId)}
                  alt={t('verifications.alt')}
                  className={swipe.image}
                />
                <div className={swipe.body}>
                  <p>
                    <strong>{item.nickname}</strong> · {item.name} · {item.email}
                  </p>
                  <p className={styles.muted}>
                    {t('memberSince', { date: formatDate(item.memberSince, locale) })} ·{' '}
                    {t('sent', { date: formatDateTime(item.sentAt, locale) })}
                  </p>
                  <p className={styles.muted}>
                    {t('verifications.check', { nickname: item.nickname ?? '' })}
                  </p>
                  <ActionForm
                    action={verificationAction.bind(null, locale, item.userId)}
                    className={styles.form}
                  >
                    <FormInput name="note" label={t('verifications.note')} maxLength={300} />
                    <div className={styles.actions}>
                      <SubmitButton size="sm" name="decision" value="approve">
                        {t('approve')}
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

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('photos.title')}</h2>
            <p className={styles.muted}>{t('photos.lead')}</p>
            {(await listAdminSwipePhotos('PENDING')).map((photo) => (
              <article key={photo.id} className={swipe.item}>
                <div className={swipe.pair}>
                  {/* oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route */}
                  <img
                    src={img('photo', photo.id)}
                    alt={t('photos.alt', { ref: photo.ref })}
                    className={swipe.image}
                  />
                  {photo.owner.hasVerificationPhoto ? (
                    // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
                    <img
                      src={img('verification', photo.owner.id)}
                      alt={t('verifications.alt')}
                      className={swipe.reference}
                    />
                  ) : null}
                </div>
                <div className={swipe.body}>
                  <p>
                    <strong>{photo.owner.nickname}</strong> · {photo.owner.email} ·{' '}
                    <code>{photo.ref}</code>
                  </p>
                  {photo.inAlbum ? <p className={styles.muted}>🔒 {t('albumTag')}</p> : null}
                  <p className={styles.muted}>
                    {t('sent', { date: formatDateTime(photo.createdAt, locale) })} ·{' '}
                    {t('reportsAgainst', { count: photo.owner.reports })}
                  </p>
                  <ActionForm
                    action={photoAction.bind(null, locale, photo.id)}
                    className={styles.form}
                  >
                    <FormInput name="reason" label={t('photos.reason')} maxLength={300} />
                    <FormCheckbox name="block" label={t('photos.block')} />
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
        </>
      ) : null}

      {tab === 'reports' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.reports')}</h2>
          {(await listAdminSwipeReports('OPEN')).map((report) => (
            <article key={report.id} className={swipe.item}>
              {report.photo ? (
                // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
                <img
                  src={img('photo', report.photo.id)}
                  alt={t('photos.alt', { ref: report.photo.ref })}
                  className={swipe.image}
                />
              ) : null}
              <div className={swipe.body}>
                <p>
                  <strong>{tr(report.reason)}</strong> · {formatDateTime(report.createdAt, locale)}
                  {report.photo ? (
                    <>
                      {' '}
                      · <code>{report.photo.ref}</code> ({t(`photoStatus.${report.photo.status}`)})
                    </>
                  ) : null}
                </p>
                <p>
                  {t('reported')}: <strong>{report.reported.nickname}</strong> ·{' '}
                  {report.reported.email} ·{' '}
                  {t('reportsAgainst', { count: report.reported.reports })}
                  {report.reported.suspended ? ` · ${t('suspendedNow')}` : ''}
                </p>
                <p className={styles.muted}>
                  {t('reporter')}: {report.reporter.nickname ?? report.reporter.name} ·{' '}
                  {report.reporter.email}
                </p>
                {report.details ? <p className={styles.prewrap}>{report.details}</p> : null}
                {report.transcript.length > 0 ? (
                  <ol className={swipe.transcript}>
                    {report.transcript.map((line) => (
                      <li key={`${line.at}-${line.text}`}>
                        <strong>{line.from === 'reporter' ? t('reporter') : t('reported')}:</strong>{' '}
                        {line.text}
                      </li>
                    ))}
                  </ol>
                ) : null}
                <ActionForm
                  action={reportAction.bind(null, locale, report.id)}
                  className={styles.form}
                >
                  {report.photo ? (
                    <>
                      <FormCheckbox name="removePhoto" label={t('reports.removePhoto')} />
                      <FormCheckbox name="blockImage" label={t('reports.blockImage')} />
                    </>
                  ) : null}
                  <FormSelect
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
          ))}
        </section>
      ) : null}

      {tab === 'takedowns' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.takedowns')}</h2>
          <p className={styles.muted}>{t('takedowns.lead')}</p>
          {(await listAdminSwipeTakedowns('OPEN')).map((request) => (
            <article key={request.id} className={swipe.item}>
              {request.photo && request.photo.status !== 'REJECTED' ? (
                // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
                <img
                  src={img('photo', request.photo.id)}
                  alt={t('photos.alt', { ref: request.photo.ref })}
                  className={swipe.image}
                />
              ) : null}
              <div className={swipe.body}>
                <p>
                  <strong>{tr(request.reason)}</strong> ·{' '}
                  {formatDateTime(request.createdAt, locale)} · {request.email}
                </p>
                <p className={styles.muted}>
                  {request.photo
                    ? t('takedowns.matched', {
                        ref: request.photo.ref,
                        nickname: request.photo.owner.nickname ?? request.photo.owner.email,
                      })
                    : t('takedowns.unmatched', { ref: request.photoRef ?? '—' })}
                </p>
                <p className={styles.prewrap}>{request.details}</p>
                <ActionForm
                  action={takedownAction.bind(null, locale, request.id)}
                  className={styles.form}
                >
                  <FormTextarea
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
                      disabled={!request.photo}
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

      {tab === 'live' || tab === 'history' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t(`tabs.${tab}`)}</h2>
          <ul className={swipe.grid}>
            {(await listAdminSwipePhotos(tab === 'live' ? 'LIVE' : 'HIDDEN')).map((photo) => (
              <li key={photo.id} className={swipe.cell}>
                {/* oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route */}
                <img
                  src={img('photo', photo.id)}
                  alt={t('photos.alt', { ref: photo.ref })}
                  className={swipe.thumb}
                />
                <span>
                  <strong>{photo.owner.nickname}</strong> · <code>{photo.ref}</code> · ♥{' '}
                  {photo.likes}
                  {photo.inAlbum ? ` · 🔒 ${t('albumTag')}` : null}
                </span>
                <ActionForm
                  action={photoAction.bind(null, locale, photo.id)}
                  className={styles.form}
                >
                  {tab === 'live' ? (
                    <SubmitButton size="sm" variant="outline" name="decision" value="hide">
                      {t('hide')}
                    </SubmitButton>
                  ) : (
                    <>
                      <FormCheckbox name="block" label={t('photos.block')} />
                      <div className={styles.actions}>
                        <SubmitButton size="sm" name="decision" value="approve">
                          {t('publish')}
                        </SubmitButton>
                        <SubmitButton size="sm" variant="outline" name="decision" value="reject">
                          {t('removeForGood')}
                        </SubmitButton>
                      </div>
                    </>
                  )}
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'suspended' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('tabs.suspended')}</h2>
          {(await listAdminSwipeSuspensions()).map((item) => (
            <article key={item.user.id} className={swipe.item}>
              <div className={swipe.body}>
                <p>
                  <strong>{item.nickname}</strong> · {item.user.email}
                </p>
                <p className={styles.muted}>
                  {item.reason ?? '—'} ·{' '}
                  {item.until ? formatDateTime(item.until, locale) : t('durations.permanent')}
                </p>
                <ActionForm action={liftAction.bind(null, locale, item.user.id)}>
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
