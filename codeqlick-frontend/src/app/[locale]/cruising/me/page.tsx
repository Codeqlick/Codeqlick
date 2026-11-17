import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormCheckboxGroup,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/app/ActionForm';
import styles from '@/components/cruising/CruisingProfile.module.css';
import { InstallApp } from '@/components/videochat/InstallApp';
import { AlbumGrantsPanel } from '@/components/cruising/AlbumShare';
import { MediaManager } from '@/components/cruising/MediaManager';
import { ProfileHeader } from '@/components/cruising/ProfileHeader';
import { SafetyPanels } from '@/components/cruising/SafetyPanels';
import { SectionNav } from '@/components/cruising/SectionNav';
import { MemberContributions } from '@/components/cruising/MemberContributions';
import { AdultBlocksList } from '@/components/adult/AdultBlocksList';
import { VerificationUpload } from '@/components/cruising/VerificationUpload';
import { VerifiedBadge } from '@/components/cruising/VerifiedBadge';
import { PushToggle } from '@/components/videochat/PushToggle';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { CRUISING_LOCALES, siteLocale } from '@/i18n/routing';
import { LOCALE_NAMES } from '@/lib/locales';
import { getCruisingStatus, getMyCruisingCheckIn, getMyCruisingMedia } from '@/lib/api/cruising';
import { listAdultBlocks } from '@/lib/api/adult';
import { getCruisingAlbumGrants } from '@/lib/api/cruising-rooms';
import { getCruisingVisits } from '@/lib/api/cruising-notifications';
import { requireUser } from '@/lib/auth/session';
import {
  CRUISING_COUNTRIES,
  countryName,
  LIMITS,
  LOOKING_FOR,
  memberHref,
  spotHref,
} from '@/lib/cruising';
import { meSections, PROFILE_GAPS, profileCompleteness } from '@/lib/cruising-profile';
import { NO_GRANTS } from '@/lib/cruising-rooms';
import { env } from '@/lib/env';
import { firstParam, formatDate, formatDateTime } from '@/lib/format';
import { requestWebapp } from '@/lib/webapp-request';
import vc from '../../videochat/videochat.module.css';
import {
  cruisingPushSubscribeAction,
  cruisingPushUnsubscribeAction,
  emailAlertsAction,
  endCheckInAction,
  favoriteSettingsAction,
  profileAction,
  unblockAction,
  uploadVerificationAction,
} from '../actions';
import { CruisingGate } from '../Gate';
import { visitsSettingsAction } from '../notifications-actions';
import { accountLanguageAction, reopenTourAction } from '../onboarding-actions';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ blocked?: string | string[] }>;
};

/**
 * My Cruising profile (architecture 4.15, "Profile pages"): how others see me and what my profile
 * misses, then its sections under a sticky sub-nav: profile, photos and videos, verification,
 * notifications, safety and privacy. Every older anchor (`#timer`, `#health`, `#me-media`…) stays.
 */
export default async function CruisingMePage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const query = await searchParams;
  const user = await requireUser(locale, `/${locale}/cruising/me`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.me' });
  const tl = await getTranslations({ locale, namespace: 'Cruising.lookingFor' });
  const tf = await getTranslations({ locale, namespace: 'Cruising.meFavorites' });
  const tp = await getTranslations({ locale, namespace: 'Cruising.push' });
  const profile = status.profile;
  const tv = await getTranslations({ locale, namespace: 'Cruising.verification' });
  const tm = await getTranslations({ locale, namespace: 'Cruising.media' });
  const tb = await getTranslations({ locale, namespace: 'Cruising.verified' });
  const onHost = (await requestWebapp()) === 'cruising';
  const tvs = await getTranslations({ locale, namespace: 'Cruising.visits' });
  const [checkIn, blocks, media, grants, visits] = await Promise.all([
    profile ? getMyCruisingCheckIn().catch(() => null) : Promise.resolve(null),
    listAdultBlocks('CRUISING').catch(() => []),
    profile?.nickname ? getMyCruisingMedia().catch(() => null) : Promise.resolve(null),
    profile?.nickname
      ? getCruisingAlbumGrants().catch(() => NO_GRANTS)
      : Promise.resolve(NO_GRANTS),
    getCruisingVisits().catch(() => null),
  ]);
  const ta = await getTranslations({ locale, namespace: 'Cruising.album' });
  const verification = status.verification;

  const countries = CRUISING_COUNTRIES.map((code) => ({
    value: code,
    label: countryName(code, locale),
  })).toSorted((a, b) => a.label.localeCompare(b.label, locale));

  // What others see: the public album's live items, the cover first.
  const publicItems = (media?.items ?? []).filter(
    (item) => item.album === 'PUBLIC' && item.status === 'LIVE',
  );
  const cover =
    publicItems.find((item) => item.cover && item.kind === 'PHOTO') ??
    publicItems.find((item) => item.kind === 'PHOTO');
  const completeness = profileCompleteness({
    profile,
    hasPhoto: publicItems.some((item) => item.kind === 'PHOTO'),
    verification: verification.status,
    verified: status.verified,
  });
  const sections = meSections(Boolean(profile?.nickname));
  // The account itself (email, password, sign-in, the data download) lives on the main site.
  const accountBase = `${env.SITE_URL.replace(/\/$/, '')}/${siteLocale(locale)}/${
    user.role === 'ADMIN' ? 'admin' : 'portal'
  }/account`;

  return (
    <div className={styles.page}>
      <div>
        <h1 className={vc.pageTitle}>{t('title')}</h1>
        <p className={styles.muted}>{profile ? t('lead') : t('leadNew')}</p>
      </div>
      {firstParam(query.blocked) ? <Alert tone="success">{t('blockedDone')}</Alert> : null}

      {profile ? (
        <div className={styles.overview}>
          <section className={styles.card} aria-labelledby="me-preview">
            <h2 id="me-preview" className={styles.cardTitle}>
              {t('previewTitle')}
            </h2>
            <ProfileHeader
              locale={locale}
              variant="preview"
              member={{
                nickname: profile.nickname,
                verified: status.verified,
                coverId: cover?.id ?? null,
                bio: profile.bio,
                country: profile.country,
                lookingFor: profile.lookingFor,
                age: null,
                badges: profile.badges,
              }}
            >
              <p>
                <Button href={memberHref(profile.nickname)} variant="outline" size="sm">
                  {t('viewProfile')}
                </Button>
              </p>
            </ProfileHeader>
          </section>

          <section className={styles.card} aria-labelledby="me-complete">
            <h2 id="me-complete" className={styles.cardTitle}>
              {t('completeTitle')}
            </h2>
            <progress
              className={styles.meter}
              value={completeness.done}
              max={completeness.total}
              aria-labelledby="me-complete"
              aria-describedby="me-complete-value"
            />
            <p id="me-complete-value" className={styles.muted}>
              {t('completeValue', { done: completeness.done, total: completeness.total })}
            </p>
            {completeness.missing.length === 0 ? (
              <p>{t('completeDone')}</p>
            ) : (
              <>
                <p className={styles.subTitle} id="me-missing">
                  {t('missingLead')}
                </p>
                <ul className={styles.gaps} aria-labelledby="me-missing">
                  {completeness.missing.map((gap) => (
                    <li key={gap}>
                      <a href={`#${PROFILE_GAPS[gap]}`} className={styles.gap}>
                        {t(`gaps.${gap}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      ) : null}

      <div className={styles.layout}>
        <SectionNav
          label={t('sectionsLabel')}
          items={sections.map((section) => ({ id: section, label: t(`sections.${section}`) }))}
        />

        <div className={styles.sections}>
          <section id="profile" className={styles.group} aria-labelledby="me-profile">
            <h2 id="me-profile" className={styles.groupTitle}>
              {t('sections.profile')}
            </h2>
            <div className={styles.card}>
              <ActionForm action={profileAction.bind(null, locale)} className={vc.form}>
                <FormInput
                  id="me-nickname"
                  name="nickname"
                  label={t('nickname')}
                  hint={
                    profile
                      ? status.verified
                        ? `${t('nicknameChange')} ${t('nicknameVerifiedNote')}`
                        : t('nicknameChange')
                      : t('nicknameHint')
                  }
                  defaultValue={profile?.nickname ?? ''}
                  minLength={3}
                  maxLength={20}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  required={profile === null}
                />
                <FormTextarea
                  id="me-bio"
                  name="bio"
                  label={t('bio')}
                  hint={t('bioHint')}
                  optionalLabel={t('optional')}
                  rows={3}
                  maxLength={LIMITS.bio}
                  defaultValue={profile?.bio ?? ''}
                />
                <FormSelect
                  id="me-country"
                  name="country"
                  label={t('country')}
                  optionalLabel={t('optional')}
                  placeholder={t('countryNone')}
                  options={countries}
                  defaultValue={profile?.country ?? ''}
                />
                <FormCheckboxGroup
                  name="lookingFor"
                  idPrefix="me-looking"
                  legend={t('lookingFor')}
                  options={LOOKING_FOR.map((value) => ({ value, label: tl(value) }))}
                  defaultValues={profile?.lookingFor ?? []}
                />
                <FormCheckbox
                  id="me-show-age"
                  name="showAge"
                  label={t('showAge')}
                  hint={t('showAgeHint')}
                  defaultChecked={profile?.showAge ?? true}
                />
                <SubmitButton pendingLabel={t('saving')}>{t('save')}</SubmitButton>
              </ActionForm>
            </div>
            {profile ? (
              <div className={styles.card}>
                <MemberContributions
                  locale={locale}
                  badges={profile.badges}
                  contributions={profile.contributions}
                  title={t('contributions')}
                  headingLevel="h3"
                  own
                />
              </div>
            ) : null}
            <section className={styles.card} aria-labelledby="me-language">
              <h3 id="me-language" className={styles.cardTitle}>
                {t('languageTitle')}
              </h3>
              <p className={styles.muted}>{t('languageLead')}</p>
              <ActionForm action={accountLanguageAction.bind(null, locale)} className={vc.form}>
                <FormSelect
                  id="me-language-select"
                  name="language"
                  label={t('languageLabel')}
                  options={CRUISING_LOCALES.map((value) => ({
                    value,
                    label: LOCALE_NAMES[value],
                  }))}
                  defaultValue={status.locale ?? locale}
                />
                <SubmitButton size="sm" pendingLabel={t('saving')}>
                  {t('save')}
                </SubmitButton>
              </ActionForm>
            </section>
          </section>

          {profile?.nickname ? (
            <section id="photos" className={styles.group} aria-labelledby="me-photos">
              <h2 id="me-photos" className={styles.groupTitle}>
                {t('sections.photos')}
              </h2>
              <section className={styles.card} aria-labelledby="me-media">
                <h3 id="me-media" className={styles.cardTitle}>
                  {tm('title')}
                </h3>
                <p className={styles.muted}>{tm('lead')}</p>
                {media ? (
                  <MediaManager
                    locale={locale}
                    onHost={onHost}
                    items={media.items}
                    limits={media.limits}
                  />
                ) : (
                  <Alert tone="error">{tm('loadError')}</Alert>
                )}
              </section>
              <section className={styles.card} aria-labelledby="me-album">
                <h3 id="me-album" className={styles.cardTitle}>
                  {ta('title')}
                </h3>
                <p className={styles.muted}>{ta('lead')}</p>
                <AlbumGrantsPanel locale={locale} grants={grants} />
              </section>
            </section>
          ) : null}

          {profile?.nickname ? (
            <section id="verification" className={styles.group} aria-labelledby="me-verify">
              <h2 id="me-verify" className={styles.groupTitle}>
                {t('sections.verification')}
              </h2>
              <section className={styles.card} aria-labelledby="me-verification">
                <h3 id="me-verification" className={styles.cardTitle}>
                  {tv('title')}
                </h3>
                {status.verified ? (
                  <>
                    <p>
                      <VerifiedBadge label={tb('label')} help={tb('help')} />
                    </p>
                    <p className={styles.muted}>{tv('approved')}</p>
                  </>
                ) : verification.status === 'PENDING' ? (
                  <Alert tone="info">{tv('pending')}</Alert>
                ) : (
                  <>
                    {verification.status === 'REJECTED' ? (
                      <Alert tone="warning">
                        {tv('rejected')}
                        {verification.note
                          ? ` ${tv('rejectedNote', { note: verification.note })}`
                          : ''}
                      </Alert>
                    ) : null}
                    <p className={styles.muted}>{tv('lead')}</p>
                    <ul className={styles.chips}>
                      <li className={styles.chip}>{tv('step1')}</li>
                      <li className={styles.chip}>{tv('step2')}</li>
                      <li className={styles.chip}>{tv('step3')}</li>
                    </ul>
                    <p className={styles.muted}>{tv('privacy')}</p>
                    <VerificationUpload
                      action={uploadVerificationAction.bind(null, locale)}
                      submitLabel={
                        verification.status === 'REJECTED' ? tv('sendAgain') : tv('send')
                      }
                    />
                  </>
                )}
              </section>
            </section>
          ) : null}

          <section id="notifications" className={styles.group} aria-labelledby="me-notifications">
            <h2 id="me-notifications" className={styles.groupTitle}>
              {t('sections.notifications')}
            </h2>
            <section className={styles.card} aria-labelledby="me-push">
              <h3 id="me-push" className={styles.cardTitle}>
                {tp('title')}
              </h3>
              <p className={styles.muted}>{tp('lead')}</p>
              {status.pushPublicKey ? (
                <PushToggle
                  publicKey={status.pushPublicKey}
                  locale={siteLocale(locale)}
                  serviceWorker="/cruising-sw.js"
                  namespace="Cruising.push"
                  subscribe={cruisingPushSubscribeAction}
                  unsubscribe={cruisingPushUnsubscribeAction}
                />
              ) : (
                <p>{tp('unavailable')}</p>
              )}
            </section>

            <section id="me-favorites" className={styles.card} aria-labelledby="me-favorites-title">
              <h3 id="me-favorites-title" className={styles.cardTitle}>
                {tf('title')}
              </h3>
              <ActionForm action={favoriteSettingsAction.bind(null, locale)} className={vc.form}>
                <FormCheckbox
                  id="me-favorite-alerts"
                  name="favoriteAlerts"
                  label={tf('alertsLabel')}
                  hint={tf('alertsHint')}
                  defaultChecked={status.favoriteAlerts}
                />
                <FormCheckbox
                  id="me-favorite-emails"
                  name="favoriteEmails"
                  label={tf('emailsLabel')}
                  hint={tf('emailsHint')}
                  defaultChecked={status.favoriteEmails}
                />
                <SubmitButton variant="outline" size="sm" pendingLabel={t('saving')}>
                  {t('save')}
                </SubmitButton>
              </ActionForm>
            </section>

            <section className={styles.card} aria-labelledby="me-alerts">
              <h3 id="me-alerts" className={styles.cardTitle}>
                {t('alertsTitle')}
              </h3>
              <ActionForm action={emailAlertsAction.bind(null, locale)} className={vc.form}>
                <FormCheckbox
                  id="me-email-alerts"
                  name="emailAlerts"
                  label={t('alertsLabel')}
                  hint={t('alertsHint')}
                  defaultChecked={status.emailAlerts}
                />
                <SubmitButton variant="outline" size="sm" pendingLabel={t('saving')}>
                  {t('save')}
                </SubmitButton>
              </ActionForm>
            </section>

            {visits ? (
              <section id="me-visits" className={styles.card} aria-labelledby="me-visits-title">
                <h3 id="me-visits-title" className={styles.cardTitle}>
                  {tvs('settingsTitle')}
                </h3>
                <ActionForm action={visitsSettingsAction.bind(null, locale)} className={vc.form}>
                  <FormCheckbox
                    id="me-show-visits"
                    name="showVisits"
                    label={tvs('settingsLabel')}
                    hint={tvs('settingsHint')}
                    defaultChecked={visits.showVisits}
                  />
                  <SubmitButton variant="outline" size="sm" pendingLabel={t('saving')}>
                    {t('save')}
                  </SubmitButton>
                </ActionForm>
              </section>
            ) : null}
          </section>

          <section id="safety" className={styles.group} aria-labelledby="me-safety">
            <h2 id="me-safety" className={styles.groupTitle}>
              {t('sections.safety')}
            </h2>
            {profile ? (
              <section className={styles.card} aria-labelledby="me-checkin">
                <h3 id="me-checkin" className={styles.cardTitle}>
                  {t('checkInTitle')}
                </h3>
                {checkIn ? (
                  <>
                    <p>
                      {t('checkInActive', {
                        time: formatDateTime(checkIn.expiresAt, locale),
                      })}{' '}
                      <Link href={spotHref(checkIn.spot.slug)} className={vc.inlineLink}>
                        {checkIn.spot.name}
                      </Link>
                      {checkIn.anonymous ? ` · ${t('checkInAnonymous')}` : ''}
                    </p>
                    <ActionForm action={endCheckInAction.bind(null, locale)}>
                      <SubmitButton variant="outline" size="sm" pendingLabel={t('ending')}>
                        {t('endCheckIn')}
                      </SubmitButton>
                    </ActionForm>
                  </>
                ) : (
                  <p className={styles.muted}>{t('checkInNone')}</p>
                )}
              </section>
            ) : null}
            <SafetyPanels
              locale={locale}
              part="safety"
              className={styles.card}
              checkInSpot={checkIn ? { id: checkIn.spot.id, name: checkIn.spot.name } : null}
            />
          </section>

          <section id="privacy" className={styles.group} aria-labelledby="me-privacy">
            <h2 id="me-privacy" className={styles.groupTitle}>
              {t('sections.privacy')}
            </h2>
            <SafetyPanels
              locale={locale}
              part="health"
              className={styles.card}
              checkInSpot={null}
            />

            {profile ? (
              <section className={styles.card} aria-labelledby="me-blocks">
                <h3 id="me-blocks" className={styles.cardTitle}>
                  {t('blocksTitle')}
                </h3>
                {blocks.length === 0 ? (
                  <p className={styles.muted}>{t('blocksEmpty')}</p>
                ) : (
                  <>
                    <p className={styles.muted}>{t('blocksLead')}</p>
                    <AdultBlocksList
                      blocks={blocks}
                      otherApp={t('blockOtherApp')}
                      blockedOn={(date) => t('blockedOn', { date })}
                      blockedIn={(app, date) => t('blockedOnIn', { app, date })}
                      date={(iso) => formatDate(iso, locale)}
                      action={(block) => (
                        <ActionForm action={unblockAction.bind(null, locale, block.ref)}>
                          <SubmitButton variant="outline" size="sm" pendingLabel={t('unblocking')}>
                            {t('unblock')}
                          </SubmitButton>
                        </ActionForm>
                      )}
                    />
                  </>
                )}
              </section>
            ) : null}

            <section className={styles.card} aria-labelledby="me-data">
              <h3 id="me-data" className={styles.cardTitle}>
                {t('dataTitle')}
              </h3>
              <p className={styles.muted}>{t('dataLead')}</p>
              <ul className={styles.linkList}>
                <li>
                  <a href={`${accountBase}/export`} className={styles.link}>
                    {t('dataExport')}
                  </a>
                </li>
                <li>
                  <a href={accountBase} className={styles.link}>
                    {t('accountSettings')}
                  </a>
                </li>
              </ul>
            </section>
          </section>

          <InstallApp className={styles.card} namespace="Cruising.install" />

          <section className={styles.card} aria-labelledby="me-tour">
            <h2 id="me-tour" className={styles.cardTitle}>
              {t('tourTitle')}
            </h2>
            <p className={styles.muted}>{t('tourLead')}</p>
            <ActionForm action={reopenTourAction.bind(null, locale)}>
              <SubmitButton variant="outline" size="sm" pendingLabel={t('saving')}>
                {t('tourReopen')}
              </SubmitButton>
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}
