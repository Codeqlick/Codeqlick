import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SpotForm } from '@/components/cruising/SpotForm';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCruisingStatus } from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import { parseCoordinate } from '@/lib/cruising';
import { firstParam } from '@/lib/format';
import vc from '../../videochat/videochat.module.css';
import { createSpotAction } from '../actions';
import { CruisingGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ lat?: string | string[]; lng?: string | string[] }>;
};

/** Propose a spot: the entry step first, then the form (`?lat=&lng=` from the map's click). */
export default async function CruisingNewPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const query = await searchParams;
  const lat = parseCoordinate(firstParam(query.lat), 'lat');
  const lng = parseCoordinate(firstParam(query.lng), 'lng');
  const point = lat !== null && lng !== null ? `?lat=${lat}&lng=${lng}` : '';
  await requireUser(locale, `/${locale}/cruising/new${point}`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.new' });

  return (
    <section className={vc.panel}>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{t('lead')}</p>
      <SpotForm
        locale={locale}
        action={createSpotAction}
        mode="create"
        defaults={{
          lat: lat === null ? undefined : String(lat),
          lng: lng === null ? undefined : String(lng),
        }}
      />
    </section>
  );
}
