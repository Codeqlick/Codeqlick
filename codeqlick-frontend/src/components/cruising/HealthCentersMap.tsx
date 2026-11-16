'use client';

import dynamic from 'next/dynamic';
import type { HealthCenter } from '@/lib/cruising-safety';
import styles from './CruisingSafety.module.css';

// Loaded in the browser only (Leaflet reads `window`).
const LeafletHealthMap = dynamic(() => import('./LeafletHealthMap'), {
  ssr: false,
  loading: () => <div className={styles.centerMap} aria-hidden="true" />,
});

/** The map of the testing centres; the list below it says the same in text. */
export function HealthCentersMap(props: { centers: HealthCenter[]; label: string }) {
  return <LeafletHealthMap {...props} />;
}
