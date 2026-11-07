import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormCheckboxGroup,
  FormInput,
  FormSelect,
} from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { InstallApp } from '@/components/videochat/InstallApp';
import { PushToggle } from '@/components/videochat/PushToggle';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { GENDERS, getVideochatStatus, INTERESTS, MAX_INTERESTS } from '@/lib/api/videochat';
import { requireUser } from '@/lib/auth/session';
import { countryOptions, languageOptions } from '@/lib/videochat-options';
import styles from '../videochat.module.css';
import { settingsAction } from './actions';

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
  if (!status.profile) redirect(`/${locale}/videochat/room`);
  const profile = status.profile;
  const genders = GENDERS.map((value) => ({ value, label: tg(value) }));

  return (
    <section className={styles.panel}>
      <h1 className={styles.pageTitle}>{t('title')}</h1>
      <p className={styles.muted}>{t('lead')}</p>
      <ActionForm action={settingsAction} className={styles.form}>
        <input type="hidden" name="locale" value={locale} />
        <FormInput
          name="nickname"
          label={t('nickname')}
          hint={t('nicknameHint')}
          defaultValue={profile.nickname ?? ''}
          maxLength={24}
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
          options={INTERESTS.map((value) => ({ value, label: ti(value) }))}
          defaultValues={profile.interests}
          className={`${styles.fieldset} ${styles.interests}`}
        />
        <p className={styles.hint}>{t('interestsHint', { max: MAX_INTERESTS })}</p>
        <SubmitButton block pendingLabel={t('saving')}>
          {t('save')}
        </SubmitButton>
      </ActionForm>
      {status.pushPublicKey ? (
        <section className={styles.subsection} aria-labelledby="videochat-push">
          <h2 id="videochat-push" className={styles.sectionTitle}>
            {tp('title')}
          </h2>
          <p className={styles.muted}>{tp('lead')}</p>
          <PushToggle publicKey={status.pushPublicKey} locale={locale} />
        </section>
      ) : null}
      <InstallApp className={styles.subsection} />
      <p className={styles.backLink}>
        <Link href="/videochat/room" className={styles.inlineLink}>
          {t('backToRoom')}
        </Link>
      </p>
    </section>
  );
}
