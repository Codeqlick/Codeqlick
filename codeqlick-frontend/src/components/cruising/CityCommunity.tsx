import { getTranslations } from 'next-intl/server';
import { startConversationAction } from '@/app/[locale]/cruising/actions';
import { createTripAction } from '@/app/[locale]/cruising/community-actions';
import adult from '@/components/adult/adult.module.css';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingStatus } from '@/lib/api/cruising';
import {
  listCruisingMeetups,
  listCruisingVisitors,
  type CruisingMeetup,
  type CruisingVisitor,
} from '@/lib/api/cruising-community';
import { memberHref } from '@/lib/cruising';
import {
  formatTripDay,
  shiftDay,
  todayUtc,
  TRIP_MAX_DAYS_AHEAD,
  TRIPS_HREF,
} from '@/lib/cruising-community';
import styles from './CruisingCommunity.module.css';
import { MeetupCard } from './MeetupCard';
import { MemberName } from './MemberName';

type CityCommunityProps = {
  locale: AppLocale;
  countryCode: string;
  citySlug: string;
  city: string;
  status: CruisingStatus;
};

/**
 * The city page's members-only part (decisions 88 and 90): its upcoming meetups, "Visiting soon"
 * (listed trips, a message from there) and the form to announce a trip to the city.
 */
export async function CityCommunity({
  locale,
  countryCode,
  citySlug,
  city,
  status,
}: CityCommunityProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.trips' });
  const tm = await getTranslations({ locale, namespace: 'Cruising.meetups' });
  const canAct = status.allowed && status.profile !== null;
  let meetups: CruisingMeetup[] | null = null;
  let visitors: CruisingVisitor[] | null = null;
  try {
    [meetups, visitors] = await Promise.all([
      listCruisingMeetups({ countryCode, citySlug }),
      listCruisingVisitors(countryCode, citySlug),
    ]);
  } catch {
    // The page is public: it still works when these can't be read.
  }
  const today = todayUtc();

  return (
    <>
      <section className={styles.section} aria-labelledby="city-meetups-title">
        <h2 id="city-meetups-title" className={adult.sectionTitle}>
          {tm('cityTitle', { city })}
        </h2>
        {meetups && meetups.length > 0 ? (
          <ul className={styles.list}>
            {meetups.map((meetup) => (
              <li key={meetup.id}>
                <MeetupCard locale={locale} meetup={meetup} canAct={canAct} showSpot />
              </li>
            ))}
          </ul>
        ) : (
          <p className={adult.muted}>{tm('noneInCity')}</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="city-visitors-title">
        <h2 id="city-visitors-title" className={adult.sectionTitle}>
          {t('visitingTitle')}
        </h2>
        <p className={adult.muted}>{t('visitingLead')}</p>
        {visitors && visitors.length > 0 ? (
          <ul className={styles.list}>
            {visitors.map((visitor) => (
              <li key={`${visitor.nickname}-${visitor.from}`} className={styles.visitor}>
                <MemberName locale={locale} member={{ ...visitor, coverId: null }}>
                  <Link href={memberHref(visitor.nickname)} className={adult.inlineLink}>
                    {visitor.nickname}
                  </Link>
                </MemberName>
                <span className={styles.meta}>
                  {t('dates', {
                    from: formatTripDay(visitor.from, locale),
                    to: formatTripDay(visitor.to, locale),
                  })}
                </span>
                {canAct ? (
                  <ActionForm action={startConversationAction.bind(null, locale, visitor.nickname)}>
                    <SubmitButton size="sm" variant="outline" pendingLabel={t('opening')}>
                      {t('message', { nickname: visitor.nickname })}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={adult.muted}>{t('visitingNone')}</p>
        )}
        {canAct ? (
          <details className={styles.disclosure}>
            <summary>{t('announceOpen', { city })}</summary>
            <ActionForm
              action={createTripAction.bind(null, locale, { countryCode, citySlug })}
              className={adult.form}
            >
              <p className={adult.muted}>{t('announceLead')}</p>
              <FormInput
                id="trip-from"
                name="from"
                type="date"
                label={t('from')}
                min={today}
                max={shiftDay(today, TRIP_MAX_DAYS_AHEAD)}
                required
              />
              <FormInput id="trip-to" name="to" type="date" label={t('to')} min={today} required />
              <FormCheckbox
                id="trip-private"
                name="private"
                label={t('private')}
                hint={t('privateHint')}
              />
              <SubmitButton pendingLabel={t('saving')}>{t('announce')}</SubmitButton>
            </ActionForm>
            <p className={adult.muted}>
              <Link href={TRIPS_HREF} className={adult.inlineLink}>
                {t('myTripsLink')}
              </Link>
            </p>
          </details>
        ) : null}
      </section>
    </>
  );
}
