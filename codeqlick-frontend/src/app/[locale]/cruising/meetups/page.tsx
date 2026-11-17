import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/cruising/CruisingCommunity.module.css';
import { MeetupCard } from '@/components/cruising/MeetupCard';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCruisingStatus } from '@/lib/api/cruising';
import { listCruisingMeetups } from '@/lib/api/cruising-community';
import { requireUser } from '@/lib/auth/session';
import { TRIPS_HREF } from '@/lib/cruising-community';
import adult from '@/components/adult/adult.module.css';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { CruisingGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/**
 * Upcoming meetups (decision 88) at my favourite spots, in my country and my trips' countries,
 * and the ones I host or go to.
 */
export default async function CruisingMeetupsPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  await requireUser(locale, `/${locale}/cruising/meetups`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.meetups' });
  const meetups = await listCruisingMeetups();
  const canAct = status.allowed && status.profile !== null;

  return (
    <>
      <h1 className={adult.pageTitle}>{t('pageTitle')}</h1>
      <p className={adult.muted}>{t('pageLead')}</p>
      <p>
        <Link href="/cruising/favorites" className={adult.inlineLink}>
          {t('favoritesLink')}
        </Link>
        {' · '}
        <Link href={TRIPS_HREF} className={adult.inlineLink}>
          {t('tripsLink')}
        </Link>
      </p>
      {meetups.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={<Button href="/cruising/map">{t('emptyAction')}</Button>}
        />
      ) : (
        <ul className={styles.list}>
          {meetups.map((meetup) => (
            <li key={meetup.id}>
              <MeetupCard
                locale={locale}
                meetup={meetup}
                canAct={canAct}
                showSpot
                headingLevel="h3"
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
