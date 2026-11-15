'use client';

import dynamic from 'next/dynamic';
import type { CruisingSpotType } from '@/lib/cruising';
import styles from './Cruising.module.css';

// Loaded in the browser only (Leaflet reads `window`), and only on a spot's page.
const LeafletSpotMap = dynamic(() => import('./LeafletSpotMap'), {
  ssr: false,
  loading: () => <div className={styles.miniMap} aria-hidden="true" />,
});

/** The small map on a spot's page. `label` names it for assistive technology. */
export function SpotLocationMap(props: {
  lat: number;
  lng: number;
  name: string;
  type: CruisingSpotType;
  label: string;
}) {
  return <LeafletSpotMap {...props} />;
}
