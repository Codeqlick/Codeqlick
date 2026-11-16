import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { CruisingMap } from '@/components/cruising/CruisingMap';
import { OnboardingTour } from '@/components/cruising/OnboardingTour';
import { getCruisingStatus, type CruisingStatus } from '@/lib/api/cruising';
import { getCurrentUser } from '@/lib/auth/session';
import { alertsEndpoint } from '@/lib/cruising-community';
import { suggestionsBbox } from '@/lib/cruising-stats';
import {
  activeEndpoint,
  cruisingPath,
  parseMapView,
  searchEndpoint,
  spotsEndpoint,
} from '@/lib/cruising';
import { firstParam } from '@/lib/format';
import { requestWebapp } from '@/lib/webapp-request';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import vc from '../../videochat/videochat.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    lat?: string | string[];
    lng?: string | string[];
    zoom?: string | string[];
  }>;
};

export async function generateMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.map' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    // The view in the address (?lat=&lng=) is the same page.
    alternates: webappAlternates('cruising', locale, '/map'),
    openGraph: { title, description, url: webappPath('cruising', locale, '/map') },
  };
}

/** The world map of spots (Leaflet, loaded in the browser): spots in view, popups, proposals. */
export default async function CruisingMapPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Cruising.map' });
  const onHost = (await requestWebapp()) === 'cruising';
  const initial = parseMapView({
    lat: firstParam(query.lat),
    lng: firstParam(query.lng),
    zoom: firstParam(query.zoom),
  });
  // "Active now" is only for members who have entered (decision 86); signed out, nothing about
  // presence is asked for.
  let entered = false;
  let status: CruisingStatus | null = null;
  if (await getCurrentUser()) {
    try {
      status = await getCruisingStatus();
      entered = status.onboarded;
    } catch {
      // The map is public: it still works without Cruising's state.
    }
  }

  return (
    <>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>
        {t('lead')}{' '}
        <Link href="/cruising/rules" className={vc.inlineLink}>
          {t('rulesLink')}
        </Link>
      </p>
      {/* Phase 6 (decision 102): the tour, until it is finished or skipped. */}
      {status?.onboarded && status.onboardingDone === false ? (
        <OnboardingTour locale={locale} status={status} near={suggestionsBbox(initial)} />
      ) : null}
      <CruisingMap
        endpoint={spotsEndpoint(locale, onHost)}
        searchEndpoint={searchEndpoint(locale, onHost)}
        activeEndpoint={entered ? activeEndpoint(locale, onHost) : null}
        alertsEndpoint={entered ? alertsEndpoint(locale, onHost) : null}
        spotBase={cruisingPath(locale, '/spots/', onHost)}
        proposeBase={cruisingPath(locale, '/new', onHost)}
        initial={initial}
      />
    </>
  );
}
