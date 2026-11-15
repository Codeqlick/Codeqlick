'use client';

import { useEffect, useRef } from 'react';
import type { CruisingSpotType } from '@/lib/cruising';
import styles from './Cruising.module.css';
import { createMap, L, spotIcon } from './leaflet-shared';

type LeafletSpotMapProps = {
  lat: number;
  lng: number;
  name: string;
  type: CruisingSpotType;
  label: string;
};

/** A spot's small location map: one marker, the same tiles and attribution. */
export default function LeafletSpotMap({ lat, lng, name, type, label }: LeafletSpotMapProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const map = createMap(element, [lat, lng], 15);
    // A page to read: the wheel scrolls the page, not the map.
    map.scrollWheelZoom.disable();
    L.marker([lat, lng], { icon: spotIcon(type), title: name, alt: name, keyboard: false }).addTo(
      map,
    );
    return () => {
      map.remove();
    };
  }, [lat, lng, name, type]);

  return <div ref={container} className={styles.miniMap} role="region" aria-label={label} />;
}
