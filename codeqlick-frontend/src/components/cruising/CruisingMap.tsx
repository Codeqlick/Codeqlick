'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { MapView } from '@/lib/cruising';
import styles from './Cruising.module.css';

function MapLoading() {
  const t = useTranslations('Cruising.map');
  return <output className={styles.mapStatus}>{t('loading')}</output>;
}

// Leaflet reads `window`: the map is loaded in the browser only, and only on this page.
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false, loading: MapLoading });

/** /map's map (architecture 6.3): the Leaflet map, loaded on demand. */
export function CruisingMap(props: {
  endpoint: string;
  searchEndpoint: string;
  /** Only for members who have entered: otherwise null and nothing about presence is asked. */
  activeEndpoint: string | null;
  /** Phase 5 (decision 91): the safety alerts' route, for members who have entered; else null. */
  alertsEndpoint: string | null;
  spotBase: string;
  proposeBase: string;
  initial: MapView;
}) {
  return <LeafletMap {...props} />;
}
