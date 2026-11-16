import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RoomChat } from '@/components/cruising/RoomChat';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCruisingCity, getCruisingStatus } from '@/lib/api/cruising';
import { getCruisingRoom } from '@/lib/api/cruising-rooms';
import { isApiError } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/session';
import { countryFromParam, countryName, placeHref, SLUG } from '@/lib/cruising';
import { ROOMS_HREF, roomMessagesEndpoint } from '@/lib/cruising-rooms';
import { requestWebapp } from '@/lib/webapp-request';
import vc from '../../../../videochat/videochat.module.css';
import { sendRoomMessageAction } from '../../../room-actions';
import { CruisingGate } from '../../../Gate';

/** Members only: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string; country: string; city: string }> };

/** A city's chat room (decision 100): it polls every 5 seconds through a route handler. */
export default async function CruisingRoomPage({ params }: PageProps) {
  const { locale: rawLocale, country: countryParam, city: citySlug } = await params;
  const locale = resolveLocale(rawLocale);
  await requireUser(locale, `/${locale}/cruising/rooms/${countryParam}/${citySlug}`);
  const code = countryFromParam(countryParam);
  if (!code || !SLUG.test(citySlug)) notFound();
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;

  const [city, room] = await Promise.all([
    getCruisingCity(code, citySlug),
    getCruisingRoom(code, citySlug).catch((error: unknown) => {
      if (isApiError(error) && error.status === 404) return null;
      throw error;
    }),
  ]);
  if (!city || !room) notFound();

  const t = await getTranslations({ locale, namespace: 'Cruising.rooms' });
  const onHost = (await requestWebapp()) === 'cruising';
  const country = countryName(code, locale);

  return (
    <>
      <nav aria-label={t('breadcrumb')} className={vc.muted}>
        <Link href={ROOMS_HREF} className={vc.inlineLink}>
          {t('title')}
        </Link>
        {' › '}
        <Link href={placeHref(code, citySlug)} className={vc.inlineLink}>
          {t('cityLink', { city: city.city, country })}
        </Link>
      </nav>
      <h1 className={vc.pageTitle}>{t('roomTitle', { city: city.city, country })}</h1>
      <p className={vc.muted}>{t('roomLead')}</p>
      {status.profile ? null : (
        <p className={vc.muted}>
          <Link href="/cruising/me" className={vc.inlineLink}>
            {t('chooseNickname')}
          </Link>
        </p>
      )}
      <RoomChat
        locale={locale}
        city={city.city}
        initial={room.items}
        initialPosting={room.posting}
        pollUrl={roomMessagesEndpoint(locale, onHost, code, citySlug)}
        send={sendRoomMessageAction.bind(null, code, citySlug)}
      />
    </>
  );
}
