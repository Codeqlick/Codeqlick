import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SpotForm } from '@/components/cruising/SpotForm';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCruisingStatus, listMyCruisingSpots } from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import vc from '../../../videochat/videochat.module.css';
import { updateSpotAction } from '../../actions';
import { CruisingGate } from '../../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string; id: string }> };

/** Edit a spot of mine that is waiting or was rejected (a rejected one goes back to review). */
export default async function CruisingEditSpotPage({ params }: PageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  await requireUser(locale, `/${locale}/cruising/my-spots/${id}`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const spot = (await listMyCruisingSpots()).find((item) => item.id === id);
  if (!spot || (spot.status !== 'PENDING' && spot.status !== 'REJECTED')) notFound();
  const t = await getTranslations({ locale, namespace: 'Cruising.mySpots' });

  return (
    <section className={vc.panel}>
      <h1 className={vc.pageTitle}>{t('editTitle')}</h1>
      <p className={vc.muted}>
        {spot.status === 'REJECTED' ? t('editLeadRejected') : t('editLead')}
      </p>
      {spot.status === 'REJECTED' ? (
        <p className={vc.answer}>
          <strong>{t('rejectReason')}:</strong> {spot.rejectReason ?? t('noReason')}
        </p>
      ) : null}
      <SpotForm
        locale={locale}
        action={updateSpotAction.bind(null, locale, spot.id)}
        mode="edit"
        defaults={{
          name: spot.name,
          type: spot.type,
          countryCode: spot.countryCode,
          city: spot.city,
          lat: spot.lat === undefined ? undefined : String(spot.lat),
          lng: spot.lng === undefined ? undefined : String(spot.lng),
          description: spot.description,
          bestTimes: spot.bestTimes ?? undefined,
        }}
      />
      <p className={vc.backLink}>
        <Link href="/cruising/my-spots" className={vc.inlineLink}>
          {t('back')}
        </Link>
      </p>
    </section>
  );
}
