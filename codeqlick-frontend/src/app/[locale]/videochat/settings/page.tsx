import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormCheckboxGroup,
  FormInput,
  FormSelect,
} from '@/components/app/ActionForm';
import { WeekStats } from '@/components/app/WeekStats';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { PhotoUpload } from '@/components/swipe/PhotoUpload';
import swipeStyles from '@/components/swipe/Swipe.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { AdZone } from '@/components/videochat/AdZone';
import { InstallApp } from '@/components/videochat/InstallApp';
import { PushToggle } from '@/components/videochat/PushToggle';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  GENDERS,
  getVideochatStatus,
  getVideochatWeekStats,
  INTERESTS,
  MAX_INTERESTS,
} from '@/lib/api/videochat';
import { ADULT_INTERESTS } from '@/lib/videochat-interests';
import { requireUser } from '@/lib/auth/session';
import { countryOptions, languageOptions } from '@/lib/videochat-options';
import styles from '../videochat.module.css';
import { settingsAction, uploadVerificationAction } from './actions';
import { appPath } from '@/lib/webapp-request';

/** Behind the account: nothing here for search engines. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/** Public profile and matching filters (architecture 4.7). All free. */
export default async function VideochatSettingsPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  await requireUser(locale, `/${locale}/videochat/settings`);
  const t = await getTranslations({ locale, namespace: 'Videochat.settings' });
  const tg = await getTranslations({ locale, namespace: 'Videochat.genders' });
  const tp = await getTranslations({ locale, namespace: 'Videochat.push' });
  const ti = await getTranslations({ locale, namespace: 'Videochat.interests' });
  const status = await getVideochatStatus();
  if (!status.profile) redirect(await appPath(`/${locale}/videochat/room`, locale));
  const profile = status.profile;
  const genders = GENDERS.map((value) => ({ value, label: tg(value) }));
  const tv = await getTranslations({ locale, namespace: 'Videochat' });
  const verification = status.verification;
  const stats = await getVideochatWeekStats().catch(() => null);

  return (
    <section className={styles.panel}>
      <h1 className={styles.pageTitle}>{t('title')}</h1>
      {stats ? (
        <div className={styles.subsection}>
          <WeekStats
            title={tv('stats.title')}
            lead={tv('stats.lead')}
            locale={locale}
            previousLabel={(count) => tv('stats.previous', { count })}
            items={(['chats', 'likes', 'contacts'] as const).map((key) => ({
              label: tv(`stats.${key}`),
              value: stats.week[key],
              previous: stats.previousWeek[key],
            }))}
          />
        </div>
      ) : null}
      <p className={styles.muted}>{t('lead')}</p>
      <ActionForm action={settingsAction} className={styles.form}>
        <input type="hidden" name="locale" value={locale} />
        <FormInput
          name="nickname"
          label={t('nickname')}
          hint={t('nicknameHint')}
          defaultValue={profile.nickname ?? ''}
          maxLength={21}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
        />
        <FormSelect
          name="gender"
          label={t('gender')}
          placeholder={t('genderNone')}
          options={genders}
          defaultValue={profile.gender ?? ''}
        />
        <FormCheckboxGroup
          name="seeking"
          legend={t('seeking')}
          options={genders}
          defaultValues={profile.seeking}
          className={styles.fieldset}
        />
        <p className={styles.hint}>{t('seekingHint')}</p>
        <FormSelect
          name="country"
          label={t('country')}
          placeholder={t('notSaid')}
          options={countryOptions(locale)}
          defaultValue={profile.country ?? ''}
        />
        <FormCheckbox
          name="sameCountryOnly"
          label={t('sameCountryOnly')}
          defaultChecked={profile.sameCountryOnly}
        />
        <FormSelect
          name="language"
          label={t('language')}
          placeholder={t('notSaid')}
          options={languageOptions(locale)}
          defaultValue={profile.language ?? ''}
        />
        <FormCheckbox
          name="sameLanguageOnly"
          label={t('sameLanguageOnly')}
          defaultChecked={profile.sameLanguageOnly}
        />
        <p className={styles.hint}>{t('filtersHint')}</p>
        <FormCheckboxGroup
          name="interests"
          legend={t('interests')}
          options={INTERESTS.filter((value) => !ADULT_INTERESTS.includes(value)).map((value) => ({
            value,
            label: ti(value),
          }))}
          defaultValues={profile.interests}
          className={`${styles.fieldset} ${styles.interests}`}
        />
        <p className={styles.hint}>{t('interestsHint', { max: MAX_INTERESTS })}</p>
        <FormCheckboxGroup
          name="adultInterests"
          legend={t('adultInterests')}
          options={ADULT_INTERESTS.map((value) => ({ value, label: ti(value) }))}
          defaultValues={profile.interests}
          className={`${styles.fieldset} ${styles.interests}`}
        />
        <p className={styles.hint}>{t('adultInterestsHint', { max: MAX_INTERESTS })}</p>
        <SubmitButton block pendingLabel={t('saving')}>
          {t('save')}
        </SubmitButton>
      </ActionForm>
      <section className={styles.subsection} aria-labelledby="videochat-verification">
        <h2 id="videochat-verification" className={styles.sectionTitle}>
          {tv('verification.title')}
          {verification.status === 'APPROVED' ? <VerifiedBadge label={tv('verified')} /> : null}
        </h2>
        <p>{tv(`verification.status.${verification.status}`)}</p>
        {verification.note && verification.status === 'REJECTED' ? (
          <p className={styles.muted}>{verification.note}</p>
        ) : null}
        {verification.status === 'PENDING' ? (
          // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
          <img
            src={`/${locale}/videochat/verification-photo`}
            alt={tv('verification.alt')}
            className={swipeStyles.preview}
          />
        ) : null}
        {verification.status === 'NONE' || verification.status === 'REJECTED' ? (
          profile.nickname ? (
            <>
              <p className={styles.muted}>
                {tv('verification.lead', { nickname: profile.nickname })}
              </p>
              <PhotoUpload
                action={uploadVerificationAction.bind(null, locale)}
                label={tv('verification.pick')}
                consentLabel={tv('verification.consent')}
                submitLabel={tv('verification.send')}
              />
            </>
          ) : (
            <p className={styles.muted}>{tv('verification.nicknameFirst')}</p>
          )
        ) : null}
      </section>
      {status.pushPublicKey ? (
        <section className={styles.subsection} aria-labelledby="videochat-push">
          <h2 id="videochat-push" className={styles.sectionTitle}>
            {tp('title')}
          </h2>
          <p className={styles.muted}>{tp('lead')}</p>
          <PushToggle
            publicKey={status.pushPublicKey}
            locale={locale}
            peakAlerts={status.peakAlerts}
          />
        </section>
      ) : null}
      <InstallApp className={styles.subsection} />
      <p className={styles.backLink}>
        <Link href="/videochat/room" className={styles.inlineLink}>
          {t('backToRoom')}
        </Link>
      </p>
      <AdZone zone="pages" className={styles.subsection} />
    </section>
  );
}
