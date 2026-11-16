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
import styles from '@/components/cruising/Cruising.module.css';
import { InstallApp } from '@/components/videochat/InstallApp';
import { MediaManager } from '@/components/cruising/MediaManager';
import { SafetyPanels } from '@/components/cruising/SafetyPanels';
import { MemberContributions } from '@/components/cruising/MemberContributions';
import { VerificationUpload } from '@/components/cruising/VerificationUpload';
import { VerifiedBadge } from '@/components/cruising/VerifiedBadge';
import { PushToggle } from '@/components/videochat/PushToggle';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  getCruisingStatus,
  getMyCruisingCheckIn,
  getMyCruisingMedia,
  listCruisingBlocks,
} from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import {
  CRUISING_COUNTRIES,
  countryName,
  LIMITS,
  LOOKING_FOR,
  memberHref,
  spotHref,
} from '@/lib/cruising';
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

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ blocked?: string | string[] }>;
};

/** My Cruising profile: nickname, bio, what I look for, check-in, emails and blocks. */
export default async function CruisingMePage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const query = await searchParams;
  await requireUser(locale, `/${locale}/cruising/me`);
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
  const [checkIn, blocks, media] = await Promise.all([
    profile ? getMyCruisingCheckIn().catch(() => null) : Promise.resolve(null),
    listCruisingBlocks().catch(() => []),
    profile?.nickname ? getMyCruisingMedia().catch(() => null) : Promise.resolve(null),
  ]);
  const verification = status.verification;

  const countries = CRUISING_COUNTRIES.map((code) => ({
    value: code,
    label: countryName(code, locale),
  })).toSorted((a, b) => a.label.localeCompare(b.label, locale));

  return (
    <>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{profile ? t('lead') : t('leadNew')}</p>
      {firstParam(query.blocked) ? <Alert tone="success">{t('blockedDone')}</Alert> : null}

      <section className={vc.panel} aria-labelledby="me-profile">
        <h2 id="me-profile" className={vc.sectionTitle}>
          {t('profileTitle')}
        </h2>
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
        {profile ? (
          <p>
            <Link href={memberHref(profile.nickname)} className={vc.inlineLink}>
              {t('viewProfile')}
            </Link>
          </p>
        ) : null}
        {profile ? (
          <MemberContributions
            locale={locale}
            badges={profile.badges}
            contributions={profile.contributions}
            title={t('contributions')}
            own
          />
        ) : null}
      </section>

      <InstallApp className={vc.panel} namespace="Cruising.install" />

      {profile ? (
        <section className={vc.panel} aria-labelledby="me-verification">
          <h2 id="me-verification" className={vc.sectionTitle}>
            {tv('title')}
          </h2>
          {status.verified ? (
            <>
              <p>
                <VerifiedBadge label={tb('label')} help={tb('help')} />
              </p>
              <p className={vc.muted}>{tv('approved')}</p>
            </>
          ) : verification.status === 'PENDING' ? (
            <Alert tone="info">{tv('pending')}</Alert>
          ) : (
            <>
              {verification.status === 'REJECTED' ? (
                <Alert tone="warning">
                  {tv('rejected')}
                  {verification.note ? ` ${tv('rejectedNote', { note: verification.note })}` : ''}
                </Alert>
              ) : null}
              <p className={vc.muted}>{tv('lead')}</p>
              <ul className={styles.tags}>
                <li className={styles.tag}>{tv('step1')}</li>
                <li className={styles.tag}>{tv('step2')}</li>
                <li className={styles.tag}>{tv('step3')}</li>
              </ul>
              <p className={vc.muted}>{tv('privacy')}</p>
              <VerificationUpload
                action={uploadVerificationAction.bind(null, locale)}
                submitLabel={verification.status === 'REJECTED' ? tv('sendAgain') : tv('send')}
              />
            </>
          )}
        </section>
      ) : null}

      {profile?.nickname ? (
        <section className={vc.panel} aria-labelledby="me-media">
          <h2 id="me-media" className={vc.sectionTitle}>
            {tm('title')}
          </h2>
          <p className={vc.muted}>{tm('lead')}</p>
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
      ) : null}

      {profile ? (
        <section className={vc.panel} aria-labelledby="me-checkin">
          <h2 id="me-checkin" className={vc.sectionTitle}>
            {t('checkInTitle')}
          </h2>
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
            <p className={vc.muted}>{t('checkInNone')}</p>
          )}
        </section>
      ) : null}

      <SafetyPanels
        locale={locale}
        checkInSpot={checkIn ? { id: checkIn.spot.id, name: checkIn.spot.name } : null}
      />

      <section className={vc.panel} aria-labelledby="me-alerts">
        <h2 id="me-alerts" className={vc.sectionTitle}>
          {t('alertsTitle')}
        </h2>
        <ActionForm action={emailAlertsAction.bind(null, locale)}>
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

      <section className={vc.panel} aria-labelledby="me-push">
        <h2 id="me-push" className={vc.sectionTitle}>
          {tp('title')}
        </h2>
        <p className={vc.muted}>{tp('lead')}</p>
        {status.pushPublicKey ? (
          <PushToggle
            publicKey={status.pushPublicKey}
            locale={locale}
            serviceWorker="/cruising-sw.js"
            namespace="Cruising.push"
            subscribe={cruisingPushSubscribeAction}
            unsubscribe={cruisingPushUnsubscribeAction}
          />
        ) : (
          <p>{tp('unavailable')}</p>
        )}
      </section>

      <section id="me-favorites" className={vc.panel} aria-labelledby="me-favorites-title">
        <h2 id="me-favorites-title" className={vc.sectionTitle}>
          {tf('title')}
        </h2>
        <ActionForm action={favoriteSettingsAction.bind(null, locale)}>
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

      {profile ? (
        <section className={vc.panel} aria-labelledby="me-blocks">
          <h2 id="me-blocks" className={vc.sectionTitle}>
            {t('blocksTitle')}
          </h2>
          {blocks.length === 0 ? (
            <p className={vc.muted}>{t('blocksEmpty')}</p>
          ) : (
            <>
              <p className={vc.muted}>{t('blocksLead')}</p>
              <ul className={styles.blockList}>
                {blocks.map((block) => (
                  <li key={block.nickname} className={styles.blockItem}>
                    <span>
                      <strong>{block.nickname}</strong>{' '}
                      <span className={styles.muted}>
                        {t('blockedOn', { date: formatDate(block.createdAt, locale) })}
                      </span>
                    </span>
                    <ActionForm action={unblockAction.bind(null, locale, block.nickname)}>
                      <SubmitButton variant="outline" size="sm" pendingLabel={t('unblocking')}>
                        {t('unblock')}
                      </SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
