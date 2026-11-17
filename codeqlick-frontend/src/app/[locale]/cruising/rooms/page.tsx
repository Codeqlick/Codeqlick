import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import card from '@/components/cruising/CruisingCard.module.css';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCruisingStatus } from '@/lib/api/cruising';
import { listCruisingRooms } from '@/lib/api/cruising-rooms';
import { requireUser } from '@/lib/auth/session';
import { countryName, placeHref } from '@/lib/cruising';
import { roomHref } from '@/lib/cruising-rooms';
import { formatDateTime } from '@/lib/format';
import adult from '@/components/adult/adult.module.css';
import { CruisingGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/**
 * My rooms (decision 100): the cities of my favourites, of my trips and my country's busiest,
 * each with when the last message was posted and how many came in the last day.
 */
export default async function CruisingRoomsPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  await requireUser(locale, `/${locale}/cruising/rooms`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.rooms' });
  const rooms = await listCruisingRooms();

  return (
    <>
      <h1 className={adult.pageTitle}>{t('pageTitle')}</h1>
      <p className={adult.muted}>{t('pageLead')}</p>
      <p>
        <Link href="/cruising/places" className={adult.inlineLink}>
          {t('placesLink')}
        </Link>
      </p>
      {rooms.length === 0 ? (
        <p>{t('none')}</p>
      ) : (
        <ul className={card.stack} aria-label={t('listTitle')}>
          {rooms.map((room) => (
            <li key={`${room.countryCode}-${room.citySlug}`} className={card.card}>
              <h2 className={card.title}>
                <Link href={roomHref(room.countryCode, room.citySlug)} className={adult.inlineLink}>
                  {room.city}
                </Link>{' '}
                <span className={adult.muted}>{countryName(room.countryCode, locale)}</span>
              </h2>
              <p className={card.meta}>
                <span>{t('count24h', { count: room.count24h })}</span>
                <span>
                  {room.lastAt
                    ? t('lastAt', { date: formatDateTime(room.lastAt, locale) })
                    : t('noMessages')}
                </span>
                <Link
                  href={placeHref(room.countryCode, room.citySlug)}
                  className={adult.inlineLink}
                >
                  {t('spotsLink')}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
