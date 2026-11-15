import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { CruisingMap } from '@/components/cruising/CruisingMap';
import { cruisingPath, parseMapView, spotsEndpoint } from '@/lib/cruising';
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
  const locale = resolveLocale((await params).locale);
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
  const locale = resolveLocale((await params).locale);
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Cruising.map' });
  const onHost = (await requestWebapp()) === 'cruising';
  const initial = parseMapView({
    lat: firstParam(query.lat),
    lng: firstParam(query.lng),
    zoom: firstParam(query.zoom),
  });

  return (
    <>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>
        {t('lead')}{' '}
        <Link href="/cruising/rules" className={vc.inlineLink}>
          {t('rulesLink')}
        </Link>
      </p>
      <CruisingMap
        endpoint={spotsEndpoint(locale, onHost)}
        spotBase={cruisingPath(locale, '/spots/', onHost)}
        proposeBase={cruisingPath(locale, '/new', onHost)}
        initial={initial}
      />
    </>
  );
}
