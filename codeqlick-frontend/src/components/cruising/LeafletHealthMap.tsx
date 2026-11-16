'use client';

import { useEffect, useRef } from 'react';
import type { HealthCenter } from '@/lib/cruising-safety';
import styles from './CruisingSafety.module.css';
import { createMap, L, MARKER_SIZE } from './leaflet-shared';

type LeafletHealthMapProps = {
  centers: HealthCenter[];
  label: string;
};

/** A marker with a cross, so it reads as a health centre without relying on colour. */
function centerIcon(): L.DivIcon {
  return L.divIcon({
    className: styles.centerMarker,
    html: '+',
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
    popupAnchor: [0, -MARKER_SIZE / 2],
  });
}

/** The popup's content built as elements: names and addresses are text, never HTML. */
function popup(center: HealthCenter): HTMLElement {
  const box = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = center.name;
  const address = document.createElement('div');
  address.textContent = center.address;
  box.append(name, address);
  if (center.url) {
    const link = document.createElement('a');
    link.href = center.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = new URL(center.url).hostname;
    box.append(link);
  }
  return box;
}

/** The testing centres' map (decision 94): every centre, framed to fit them all. */
export default function LeafletHealthMap({ centers, label }: LeafletHealthMapProps) {
  const container = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const map = createMap(element, [40.4, -3.7], 4);
    map.scrollWheelZoom.disable();
    const icon = centerIcon();
    for (const center of centers) {
      L.marker([center.lat, center.lng], { icon, title: center.name, alt: center.name })
        .bindPopup(popup(center))
        .addTo(map);
    }
    if (centers.length > 0) {
      map.fitBounds(
        L.latLngBounds(centers.map((center) => [center.lat, center.lng] as [number, number])),
        { padding: [32, 32], maxZoom: 13 },
      );
    }
    return () => {
      map.remove();
    };
  }, [centers]);

  return <section ref={container} className={styles.centerMap} aria-label={label} />;
}
