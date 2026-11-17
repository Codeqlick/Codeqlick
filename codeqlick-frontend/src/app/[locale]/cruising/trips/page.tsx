import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/cruising/CruisingCommunity.module.css';
import cruising from '@/components/cruising/Cruising.module.css';
import { MeetupCard } from '@/components/cruising/MeetupCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import card from '@/components/cruising/CruisingCard.module.css';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCruisingStatus } from '@/lib/api/cruising';
import { listCruisingTrips } from '@/lib/api/cruising-community';
import { requireUser } from '@/lib/auth/session';
import { countryName, placeHref, spotHref } from '@/lib/cruising';
import { formatTripDay } from '@/lib/cruising-community';
import vc from '../../videochat/videochat.module.css';
import { deleteTripAction } from '../community-actions';
import { CruisingGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/**
 * My trips (decision 90): each card shows the city's busiest spots now and its meetups during the
 * trip. A trip is announced from its city's page.
 */
export default async function CruisingTripsPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  await requireUser(locale, `/${locale}/cruising/trips`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.trips' });
  const trips = await listCruisingTrips();
  const canAct = status.allowed && status.profile !== null;

  return (
    <>
      <h1 className={vc.pageTitle}>{t('pageTitle')}</h1>
      <p className={vc.muted}>{t('pageLead')}</p>
      <p>
        <Link href="/cruising/places" className={vc.inlineLink}>
          {t('findCity')}
        </Link>
      </p>
      {trips.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className={styles.list}>
          {trips.map((trip) => (
            <li key={trip.id}>
              <article className={card.card} aria-labelledby={`trip-${trip.id}`}>
                <h2 id={`trip-${trip.id}`} className={card.title}>
                  <Link href={placeHref(trip.countryCode, trip.citySlug)} className={vc.inlineLink}>
                    {trip.city}, {countryName(trip.countryCode, locale)}
                  </Link>
                </h2>
                <p className={styles.meta}>
                  {t('dates', {
                    from: formatTripDay(trip.from, locale),
                    to: formatTripDay(trip.to, locale),
                  })}
                  {' · '}
                  {trip.listed ? t('listed') : t('privateTrip')}
                </p>
                <h3 className={styles.subTitle}>{t('busiest')}</h3>
                {trip.spots.length > 0 ? (
                  <ul className={styles.names}>
                    {trip.spots.map((spot) => (
                      <li key={spot.id}>
                        <Link href={spotHref(spot.slug)} className={vc.inlineLink}>
                          {spot.name}
                        </Link>
                        {spot.here > 0 ? (
                          <>
                            {' '}
                            <span className={cruising.hereBadge}>
                              {t('hereNow', { count: spot.here })}
                            </span>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={vc.muted}>{t('noSpots')}</p>
                )}
                <h3 className={styles.subTitle}>{t('meetupsThen')}</h3>
                {trip.meetups.length > 0 ? (
                  <ul className={styles.list}>
                    {trip.meetups.map((meetup) => (
                      <li key={meetup.id}>
                        <MeetupCard
                          locale={locale}
                          meetup={meetup}
                          canAct={canAct}
                          showSpot
                          headingLevel="h4"
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={vc.muted}>{t('noMeetups')}</p>
                )}
                <ActionForm action={deleteTripAction.bind(null, locale, trip.id)}>
                  <SubmitButton size="sm" variant="outline" pendingLabel={t('deleting')}>
                    {t('delete')}
                  </SubmitButton>
                </ActionForm>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
