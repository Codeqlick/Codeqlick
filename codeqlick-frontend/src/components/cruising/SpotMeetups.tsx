import { getTranslations } from 'next-intl/server';
import { planMeetupAction } from '@/app/[locale]/cruising/community-actions';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingSpotPublic, CruisingStatus } from '@/lib/api/cruising';
import { listCruisingMeetups, type CruisingMeetup } from '@/lib/api/cruising-community';
import { MEETUP_HOURS, MEETUP_LIMITS } from '@/lib/cruising-community';
import styles from './CruisingCommunity.module.css';
import { LocalDateTimeField } from './LocalDateTimeField';
import { MeetupCard } from './MeetupCard';

type SpotMeetupsProps = { locale: AppLocale; spot: CruisingSpotPublic; status: CruisingStatus };

/**
 * A spot's upcoming meetups and the form to plan one (decision 88), for members who entered.
 * Planning and saying "I'm going" need a nickname.
 */
export async function SpotMeetups({ locale, spot, status }: SpotMeetupsProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.meetups' });
  const canAct = status.allowed && status.profile !== null;
  let meetups: CruisingMeetup[] | null = null;
  try {
    meetups = await listCruisingMeetups({ spotId: spot.id });
  } catch {
    // The page still works when the meetups can't be read.
  }
  const hours = MEETUP_HOURS.map((value) => ({
    value: String(value),
    label: t('hours', { count: value }),
  }));

  return (
    <section className={styles.section} aria-labelledby="spot-meetups-title">
      <h2 id="spot-meetups-title" className={vc.sectionTitle}>
        {t('spotTitle')}
      </h2>
      {meetups === null ? (
        <p className={vc.muted}>{t('loadError')}</p>
      ) : meetups.length === 0 ? (
        <p className={vc.muted}>{t('noneHere')}</p>
      ) : (
        <ul className={styles.list}>
          {meetups.map((meetup) => (
            <li key={meetup.id}>
              <MeetupCard locale={locale} meetup={meetup} canAct={canAct} />
            </li>
          ))}
        </ul>
      )}
      {canAct ? (
        <details className={styles.disclosure}>
          <summary>{t('planOpen')}</summary>
          <ActionForm action={planMeetupAction.bind(null, locale, spot.id)} className={vc.form}>
            <p className={vc.muted}>{t('planLead')}</p>
            <FormInput
              id="meetup-title"
              name="title"
              label={t('title')}
              maxLength={MEETUP_LIMITS.title}
              required
            />
            <LocalDateTimeField
              id="meetup-starts"
              name="startsAt"
              label={t('startsAt')}
              hint={t('startsAtHint')}
            />
            <FormSelect
              id="meetup-hours"
              name="hours"
              label={t('duration')}
              options={hours}
              defaultValue="2"
            />
            <FormInput
              id="meetup-capacity"
              name="capacity"
              type="number"
              inputMode="numeric"
              min={MEETUP_LIMITS.minCapacity}
              max={MEETUP_LIMITS.maxCapacity}
              label={t('capacity')}
              hint={t('capacityHint')}
              optionalLabel={t('optional')}
            />
            <FormTextarea
              id="meetup-description"
              name="description"
              label={t('description')}
              hint={t('descriptionHint')}
              optionalLabel={t('optional')}
              rows={3}
              maxLength={MEETUP_LIMITS.description}
            />
            <SubmitButton pendingLabel={t('planning')}>{t('plan')}</SubmitButton>
          </ActionForm>
        </details>
      ) : status.profile === null ? (
        <p className={vc.muted}>
          {t('needNickname')}{' '}
          <Link href="/cruising/me" className={vc.inlineLink}>
            {t('chooseNickname')}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
