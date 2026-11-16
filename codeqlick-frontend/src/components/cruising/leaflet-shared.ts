import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CruisingSpotType } from '@/lib/cruising';
import styles from './Cruising.module.css';

/**
 * What the two Leaflet maps (the big one and a spot's small one) share. Only ever loaded in the
 * browser, by a dynamic import with `ssr: false` (Leaflet reads `window`), and only on /map and
 * the spot pages. Leaflet comes from npm: no CDN (architecture 4.15).
 */

/** OpenStreetMap's tile server; the Cruising host's CSP allows exactly this host for images. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** The attribution OpenStreetMap requires on every map showing its tiles. */
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/** A letter on each marker, so the type doesn't depend on its colour alone (the legend names them). */
export const TYPE_GLYPH: Record<CruisingSpotType, string> = {
  BEACH: 'B',
  PARK: 'P',
  FOREST: 'F',
  REST_AREA: 'R',
  SAUNA: 'S',
  BAR_CLUB: 'C',
  CINEMA: 'K',
  OTHER: 'O',
};

export const MARKER_SIZE = 26;

/** A round marker in the type's colour (brand tokens, see Cruising.module.css), with its letter. */
export function spotIcon(type: CruisingSpotType): L.DivIcon {
  return L.divIcon({
    className: `${styles.marker} ${styles[`marker${type}`] ?? ''}`,
    html: TYPE_GLYPH[type],
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
    popupAnchor: [0, -MARKER_SIZE / 2],
  });
}

/**
 * The marker of a spot with someone there now (decision 86): the type's marker with a pulsing ring
 * and the count. Only built for members who have entered.
 */
export function activeSpotIcon(type: CruisingSpotType, here: number): L.DivIcon {
  const count = here > 99 ? '99+' : String(Math.max(0, Math.floor(here)));
  return L.divIcon({
    className: `${styles.marker} ${styles[`marker${type}`] ?? ''} ${styles.markerActive ?? ''}`,
    html: `${TYPE_GLYPH[type]}<span class="${styles.activeCount ?? ''}">${count}</span>`,
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
    popupAnchor: [0, -MARKER_SIZE / 2],
  });
}

/** A base map with OpenStreetMap's tiles and attribution. */
export function createMap(element: HTMLElement, center: [number, number], zoom: number): L.Map {
  const map = L.map(element, { center, zoom, minZoom: 2, worldCopyJump: true });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  return map;
}

export { L };
