import { PageHeader } from '@/components/ui/PageHeader';
import type { Metadata } from 'next';
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
import { WeekStats } from '@/components/app/WeekStats';
import { AdultBlocksList } from '@/components/adult/AdultBlocksList';
import { PhotoUpload } from '@/components/swipe/PhotoUpload';
import styles from '@/components/swipe/Swipe.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { PushToggle } from '@/components/videochat/PushToggle';
import {
  getSwipePushKey,
  getSwipeStats,
  getSwipeStatus,
  listMySwipePhotos,
  MAX_ALBUM_PHOTOS,
  type MyPhoto,
  MAX_AGE_FILTER,
  MIN_AGE_FILTER,
  SWIPE_COUNTRIES,
  SWIPE_GENDERS,
} from '@/lib/api/swipe';
import { listAdultBlocks } from '@/lib/api/adult';
import { requireUser } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { INTERESTS, MAX_INTERESTS } from '@/lib/videochat-interests';
import adult from '@/components/adult/adult.module.css';
import {
  deletePhotoAction,
  movePhotoAction,
  uploadAlbumPhotoAction,
  profileAction,
  swipePushSubscribeAction,
  swipePushUnsubscribeAction,
  uploadPhotoAction,
  unblockAction,
  uploadVerificationAction,
} from '../actions';
import { SwipeGate } from '../Gate';
import { appPath } from '@/lib/webapp-request';
import { AccountSettingsLink } from '@/components/account/AccountSettingsLink';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/** My profile, my verification photo and my photos (with their review status and likes). */
export default async function SwipePhotosPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser(locale, `/${locale}/swipe/photos`);
  const status = await getSwipeStatus();
  const gate = await SwipeGate({ locale, status });
  if (gate) return gate;
  if (!status.profile) redirect(await appPath(`/${locale}/swipe/deck`, locale));
  const t = await getTranslations({ locale, namespace: 'Swipe' });
  const ti = await getTranslations({ locale, namespace: 'Videochat.interests' });
  const tb = await getTranslations({ locale, namespace: 'Swipe.blocks' });
  const [photos, blocks] = await Promise.all([
    listMySwipePhotos(),
    listAdultBlocks('SWIPE').catch(() => []),
  ]);
  const profile = status.profile;
  const genders = SWIPE_GENDERS.map((value) => ({ value, label: t(`genders.${value}`) }));
  const verification = status.verification;
  const isActive = (photo: MyPhoto) => photo.status === 'PENDING' || photo.status === 'LIVE';
  const publicPhotos = photos.filter((photo) => !photo.inAlbum);
  const albumPhotos = photos.filter((photo) => photo.inAlbum);
  const active = publicPhotos.filter(isActive);
  const activeAlbum = albumPhotos.filter(isActive);
  const photoList = (list: MyPhoto[]) => (
    <ul className={styles.photoGrid}>
      {list.map((photo) => (
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
          {photo.rejectReason ? <span className={styles.hint}>{photo.rejectReason}</span> : null}
          <span className={styles.hint}>
            {photo.inAlbum ? null : <>{t('photos.likes', { count: photo.likes })} · </>}
            <code>{photo.ref}</code> · {formatDate(photo.createdAt, locale)}
          </span>
          {photo.status === 'REJECTED' ? null : (
            <ActionForm action={movePhotoAction.bind(null, locale, photo.id, !photo.inAlbum)}>
              <SubmitButton variant="ghost" size="sm" pendingLabel={t('album.moving')}>
                {photo.inAlbum ? t('album.toPublic') : t('album.toAlbum')}
              </SubmitButton>
            </ActionForm>
          )}
          <ActionForm action={deletePhotoAction.bind(null, locale, photo.id)}>
            <SubmitButton variant="ghost" size="sm" pendingLabel={t('photos.deleting')}>
              {t('photos.delete')}
            </SubmitButton>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
  const countries = SWIPE_COUNTRIES.map((value) => ({
    value,
    label: regionNames.of(value) ?? value,
  })).sort((a, b) => a.label.localeCompare(b.label, locale));
  // Figures only matter once there are photos for others to see.
  const stats = status.canUpload ? await getSwipeStats().catch(() => null) : null;
  const pushKey = await getSwipePushKey()
    .then((result) => result.publicKey)
    .catch(() => null);

  return (
    <div className={adult.landing}>
      <PageHeader className={adult.panelHeader} title={t('profile.title')} />
      {stats ? (
        <div className={adult.panel}>
          <WeekStats
            title={t('stats.title')}
            lead={t('stats.lead')}
            locale={locale}
            previousLabel={(count) => t('stats.previous', { count })}
            items={(['views', 'likes', 'loves', 'matches'] as const).map((key) => ({
              label: t(`stats.${key}`),
              value: stats.week[key],
              previous: stats.previousWeek[key],
            }))}
          />
        </div>
      ) : null}
      <section className={adult.panel}>
        <p className={adult.muted}>{t('profile.lead')}</p>
        <ActionForm action={profileAction} className={adult.form}>
          <input type="hidden" name="locale" value={locale} />
          <FormInput
            name="nickname"
            label={t('profile.nickname')}
            hint={t('profile.nicknameHint')}
            defaultValue={profile.nickname ?? user.username ?? ''}
            maxLength={21}
            autoCapitalize="none"
            spellCheck={false}
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
            className={adult.fieldset}
          />
          <p className={styles.hint}>{t('profile.seekingHint')}</p>
          <FormCheckboxGroup
            name="interests"
            legend={t('profile.interests')}
            options={INTERESTS.map((value) => ({ value, label: ti(value) }))}
            defaultValues={profile.interests}
            className={`${adult.fieldset} ${adult.interests}`}
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
          <fieldset className={adult.fieldset}>
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
          <SubmitButton pendingLabel={t('profile.saving')}>{t('profile.save')}</SubmitButton>
        </ActionForm>
      </section>

      {pushKey ? (
        <section className={adult.panel} aria-labelledby="swipe-push">
          <h2 id="swipe-push" className={adult.sectionTitle}>
            {t('push.title')}
          </h2>
          <p className={adult.muted}>{t('push.lead')}</p>
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

      <section className={adult.panel} aria-labelledby="swipe-verification">
        <h2 id="swipe-verification" className={adult.sectionTitle}>
          {t('verification.title')}
        </h2>
        <p>{t(`verification.status.${verification.status}`)}</p>
        <p className={adult.muted}>{t('verification.shared')}</p>
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
              <p className={adult.muted}>
                {t('verification.lead', { nickname: profile.nickname })}
              </p>
              <PhotoUpload
                action={uploadVerificationAction.bind(null, locale)}
                label={t('verification.pick')}
                consentLabel={t('verification.consent')}
                submitLabel={t('verification.send')}
              />
            </>
          ) : (
            <p className={adult.muted}>{t('verification.nicknameFirst')}</p>
          )
        ) : null}
      </section>

      <section className={adult.panel} aria-labelledby="swipe-photos">
        <h2 id="swipe-photos" className={adult.sectionTitle}>
          {t('photos.title')}
        </h2>
        <p className={adult.muted}>{t('photos.lead', { count: active.length, max: 10 })}</p>
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
        <div className={adult.warning} role="note">
          {t('photos.rules')}
        </div>
        {publicPhotos.length === 0 ? (
          <p className={adult.muted}>{t('photos.empty')}</p>
        ) : (
          photoList(publicPhotos)
        )}
      </section>

      <section className={adult.panel} aria-labelledby="swipe-album">
        <h2 id="swipe-album" className={adult.sectionTitle}>
          🔒 {t('album.title')}
        </h2>
        <p className={adult.muted}>
          {t('album.lead', { count: activeAlbum.length, max: MAX_ALBUM_PHOTOS })}
        </p>
        {status.canUpload ? (
          activeAlbum.length < MAX_ALBUM_PHOTOS ? (
            <PhotoUpload
              action={uploadAlbumPhotoAction.bind(null, locale)}
              label={t('album.pick')}
              consentLabel={t('photos.consent')}
              submitLabel={t('album.send')}
            />
          ) : (
            <p className={styles.hint}>{t('album.full')}</p>
          )
        ) : (
          <p className={styles.hint}>{t('photos.verifyFirst')}</p>
        )}
        {albumPhotos.length === 0 ? (
          <p className={adult.muted}>{t('album.empty')}</p>
        ) : (
          photoList(albumPhotos)
        )}
      </section>
      <AccountSettingsLink locale={locale} />

      <section className={adult.panel} aria-labelledby="swipe-blocks">
        <h2 id="swipe-blocks" className={adult.sectionTitle}>
          {tb('title')}
        </h2>
        {blocks.length === 0 ? (
          <p className={adult.muted}>{tb('empty')}</p>
        ) : (
          <>
            <p className={adult.muted}>{tb('lead')}</p>
            <AdultBlocksList
              blocks={blocks}
              otherApp={tb('otherApp')}
              blockedOn={(date) => tb('blockedOn', { date })}
              blockedIn={(app, date) => tb('blockedOnIn', { app, date })}
              date={(iso) => formatDate(iso, locale)}
              action={(block) => (
                <ActionForm action={unblockAction.bind(null, locale, block.ref)}>
                  <SubmitButton variant="ghost" size="sm" pendingLabel={tb('unblocking')}>
                    {tb('unblock')}
                  </SubmitButton>
                </ActionForm>
              )}
            />
          </>
        )}
      </section>
    </div>
  );
}
