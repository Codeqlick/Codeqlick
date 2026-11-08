import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormCheckboxGroup,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/app/ActionForm';
import { PhotoUpload } from '@/components/swipe/PhotoUpload';
import styles from '@/components/swipe/Swipe.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { PushToggle } from '@/components/videochat/PushToggle';
import {
  getSwipePushKey,
  getSwipeStatus,
  listMySwipePhotos,
  MAX_AGE_FILTER,
  MIN_AGE_FILTER,
  SWIPE_COUNTRIES,
  SWIPE_GENDERS,
} from '@/lib/api/swipe';
import { requireUser } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { INTERESTS, MAX_INTERESTS } from '@/lib/videochat-interests';
import vc from '../../videochat/videochat.module.css';
import {
  deletePhotoAction,
  profileAction,
  swipePushSubscribeAction,
  swipePushUnsubscribeAction,
  uploadPhotoAction,
  uploadVerificationAction,
} from '../actions';
import { SwipeGate } from '../Gate';
import { appPath } from '@/lib/webapp-request';

type PageProps = { params: Promise<{ locale: string }> };

/** My profile, my verification photo and my photos (with their review status and likes). */
export default async function SwipePhotosPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  await requireUser(locale, `/${locale}/swipe/photos`);
  const status = await getSwipeStatus();
  const gate = await SwipeGate({ locale, status });
  if (gate) return gate;
  if (!status.profile) redirect(await appPath(`/${locale}/swipe/deck`, locale));
  const t = await getTranslations({ locale, namespace: 'Swipe' });
  const ti = await getTranslations({ locale, namespace: 'Videochat.interests' });
  const photos = await listMySwipePhotos();
  const profile = status.profile;
  const genders = SWIPE_GENDERS.map((value) => ({ value, label: t(`genders.${value}`) }));
  const verification = status.verification;
  const active = photos.filter((photo) => photo.status === 'PENDING' || photo.status === 'LIVE');
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
  const countries = SWIPE_COUNTRIES.map((value) => ({
    value,
    label: regionNames.of(value) ?? value,
  })).sort((a, b) => a.label.localeCompare(b.label, locale));
  const pushKey = await getSwipePushKey()
    .then((result) => result.publicKey)
    .catch(() => null);

  return (
    <div className={vc.landing}>
      <section className={vc.panel}>
        <h1 className={vc.pageTitle}>{t('profile.title')}</h1>
        <p className={vc.muted}>{t('profile.lead')}</p>
        <ActionForm action={profileAction} className={vc.form}>
          <input type="hidden" name="locale" value={locale} />
          <FormInput
            name="nickname"
            label={t('profile.nickname')}
            hint={t('profile.nicknameHint')}
            defaultValue={profile.nickname ?? ''}
            maxLength={24}
            autoComplete="off"
            required
          />
          <FormSelect
            name="gender"
            label={t('profile.gender')}
            placeholder={t('profile.genderNone')}
            options={genders}
            defaultValue={profile.gender ?? ''}
          />
          <FormCheckboxGroup
            name="seeking"
            legend={t('profile.seeking')}
            options={genders}
            defaultValues={profile.seeking}
            className={vc.fieldset}
          />
          <p className={styles.hint}>{t('profile.seekingHint')}</p>
          <FormCheckboxGroup
            name="interests"
            legend={t('profile.interests')}
            options={INTERESTS.map((value) => ({ value, label: ti(value) }))}
            defaultValues={profile.interests}
            className={`${vc.fieldset} ${vc.interests}`}
          />
          <p className={styles.hint}>{t('profile.interestsHint', { max: MAX_INTERESTS })}</p>
          <FormTextarea
            name="bio"
            label={t('profile.bio')}
            hint={t('profile.bioHint')}
            defaultValue={profile.bio ?? ''}
            maxLength={160}
            rows={2}
          />
          {profile.birthYear === null ? (
            <FormInput
              name="birthYear"
              type="number"
              inputMode="numeric"
              label={t('profile.birthYear')}
              hint={t('profile.birthYearHint')}
              min={1900}
              max={new Date().getUTCFullYear() - 18}
            />
          ) : null}
          <FormSelect
            name="country"
            label={t('profile.country')}
            placeholder={t('profile.countryNone')}
            options={countries}
            defaultValue={profile.country ?? ''}
          />
          <fieldset className={vc.fieldset}>
            <legend>{t('profile.ages')}</legend>
            <div className={styles.ageRange}>
              <FormInput
                name="ageMin"
                type="number"
                inputMode="numeric"
                label={t('profile.ageMin')}
                min={MIN_AGE_FILTER}
                max={MAX_AGE_FILTER}
                defaultValue={String(profile.ageMin)}
              />
              <FormInput
                name="ageMax"
                type="number"
                inputMode="numeric"
                label={t('profile.ageMax')}
                min={MIN_AGE_FILTER}
                max={MAX_AGE_FILTER}
                defaultValue={String(profile.ageMax)}
              />
            </div>
          </fieldset>
          <p className={styles.hint}>{t('profile.agesHint')}</p>
          <FormCheckbox
            name="sameCountry"
            label={t('profile.sameCountry')}
            hint={t('profile.sameCountryHint')}
            defaultChecked={profile.sameCountry}
          />
          <FormCheckbox
            name="blurPhotos"
            label={t('profile.blurPhotos')}
            hint={t('profile.blurPhotosHint')}
            defaultChecked={profile.blurPhotos}
          />
          <FormCheckbox
            name="emailAlerts"
            label={t('profile.emailAlerts')}
            hint={t('profile.emailAlertsHint')}
            defaultChecked={profile.emailAlerts}
          />
          <SubmitButton block pendingLabel={t('profile.saving')}>
            {t('profile.save')}
          </SubmitButton>
        </ActionForm>
      </section>

      {pushKey ? (
        <section className={vc.panel} aria-labelledby="swipe-push">
          <h2 id="swipe-push" className={vc.sectionTitle}>
            {t('push.title')}
          </h2>
          <p className={vc.muted}>{t('push.lead')}</p>
          <PushToggle
            publicKey={pushKey}
            locale={locale}
            serviceWorker="/swipe-sw.js"
            namespace="Swipe.push"
            subscribe={swipePushSubscribeAction}
            unsubscribe={swipePushUnsubscribeAction}
          />
        </section>
      ) : null}

      <section className={vc.panel} aria-labelledby="swipe-verification">
        <h2 id="swipe-verification" className={vc.sectionTitle}>
          {t('verification.title')}
        </h2>
        <p>{t(`verification.status.${verification.status}`)}</p>
        {verification.note ? <p className={styles.ok}>{verification.note}</p> : null}
        {verification.hasPhoto ? (
          // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
          <img
            src={`/${locale}/swipe/img/verification`}
            alt={t('verification.alt')}
            className={styles.preview}
          />
        ) : null}
        {verification.status === 'NONE' || verification.status === 'REJECTED' ? (
          profile.nickname ? (
            <>
              <p className={vc.muted}>{t('verification.lead', { nickname: profile.nickname })}</p>
              <PhotoUpload
                action={uploadVerificationAction.bind(null, locale)}
                label={t('verification.pick')}
                consentLabel={t('verification.consent')}
                submitLabel={t('verification.send')}
              />
            </>
          ) : (
            <p className={vc.muted}>{t('verification.nicknameFirst')}</p>
          )
        ) : null}
      </section>

      <section className={vc.panel} aria-labelledby="swipe-photos">
        <h2 id="swipe-photos" className={vc.sectionTitle}>
          {t('photos.title')}
        </h2>
        <p className={vc.muted}>{t('photos.lead', { count: active.length, max: 10 })}</p>
        {status.canUpload ? (
          active.length < 10 ? (
            <PhotoUpload
              action={uploadPhotoAction.bind(null, locale)}
              label={t('photos.pick')}
              consentLabel={t('photos.consent')}
              submitLabel={t('photos.send')}
            />
          ) : (
            <p className={styles.hint}>{t('photos.full')}</p>
          )
        ) : (
          <p className={styles.hint}>{t('photos.verifyFirst')}</p>
        )}
        <div className={vc.warning} role="note">
          {t('photos.rules')}
        </div>
        {photos.length === 0 ? (
          <p className={vc.muted}>{t('photos.empty')}</p>
        ) : (
          <ul className={styles.photoGrid}>
            {photos.map((photo) => (
              <li key={photo.id} className={styles.photoItem}>
                {photo.status === 'REJECTED' ? (
                  <span className={styles.thumb} aria-hidden="true" />
                ) : (
                  // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
                  <img src={`/${locale}/swipe/img/${photo.id}`} alt="" className={styles.thumb} />
                )}
                <span className={`${styles.status} ${styles[`status${photo.status}`] ?? ''}`}>
                  {t(`photos.status.${photo.status}`)}
                </span>
                {photo.rejectReason ? (
                  <span className={styles.hint}>{photo.rejectReason}</span>
                ) : null}
                <span className={styles.hint}>
                  {t('photos.likes', { count: photo.likes })} · <code>{photo.ref}</code> ·{' '}
                  {formatDate(photo.createdAt, locale)}
                </span>
                <ActionForm action={deletePhotoAction.bind(null, locale, photo.id)}>
                  <SubmitButton variant="ghost" size="sm" pendingLabel={t('photos.deleting')}>
                    {t('photos.delete')}
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
