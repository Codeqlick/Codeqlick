'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { CruisingSpotSummary } from '@/lib/api/cruising';
import {
  boundsToBboxes,
  formatBbox,
  formatRating,
  mergeSpots,
  roundCoordinate,
  SPOT_TYPES,
  type MapView,
} from '@/lib/cruising';
import styles from './Cruising.module.css';
import { createMap, L, spotIcon, TYPE_GLYPH } from './leaflet-shared';

type LeafletMapProps = {
  /** The BFF route that answers with the spots in a box (never the API itself). */
  endpoint: string;
  /** `/es/spots/` (the spot's slug follows) and `/es/new` on this host. */
  spotBase: string;
  proposeBase: string;
  initial: MapView;
};

type Load = { status: 'loading' | 'ready' | 'error'; truncated: boolean };
type Locate = 'idle' | 'busy' | 'denied' | 'unsupported';

/** How long the map rests after moving before it asks for the spots in view. */
const MOVE_DELAY_MS = 350;

/**
 * The Leaflet map of /map. When it stops moving it asks the route handler for the spots in view;
 * a marker's popup links to the spot's page, and a click offers "Propose a spot here". "Locate me"
 * asks the browser for the position and only centres the map: nothing is sent anywhere.
 */
export default function LeafletMap({ endpoint, spotBase, proposeBase, initial }: LeafletMapProps) {
  const t = useTranslations('Cruising.map');
  const tt = useTranslations('Cruising.types');
  const filterId = useId();
  const container = useRef<HTMLElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const reload = useRef<() => void>(() => undefined);
  const [type, setType] = useState('');
  const typeRef = useRef('');
  const [spots, setSpots] = useState<CruisingSpotSummary[]>([]);
  const [load, setLoad] = useState<Load>({ status: 'loading', truncated: false });
  const [locate, setLocate] = useState<Locate>('idle');

  // Texts the popups are built with, kept current without rebuilding the map.
  const labels = {
    view: t('viewSpot'),
    propose: t('proposeHere'),
    proposeNote: t('proposeNote'),
    reviews: (count: number) => t('reviewsCount', { count }),
    noReviews: t('noReviews'),
  };
  const labelsRef = useRef(labels);
  useEffect(() => {
    labelsRef.current = labels;
  });
  const typeNamesRef = useRef<(value: string) => string>(() => '');
  useEffect(() => {
    typeNamesRef.current = (value: string) => tt(value as (typeof SPOT_TYPES)[number]);
  });

  const [startLat, startLng] = initial.center;
  const startZoom = initial.zoom;

  // The map, once (again only if the page is opened on another starting view).
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const map = createMap(element, [startLat, startLng], startZoom);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    let timer: ReturnType<typeof setTimeout> | undefined;
    // The request in flight, aborted by the next one (a property: the async loader can't reassign a variable).
    const inflight: { controller?: AbortController } = {};

    const fetchView = async () => {
      const bounds = map.getBounds();
      const boxes = boundsToBboxes(
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      );
      inflight.controller?.abort();
      const current = new AbortController();
      inflight.controller = current;
      setLoad((state) => ({ ...state, status: 'loading' }));
      try {
        const results = await Promise.all(
          boxes.map(async (box) => {
            const params = new URLSearchParams({ bbox: formatBbox(box) });
            if (typeRef.current) params.set('type', typeRef.current);
            const response = await fetch(`${endpoint}?${params}`, { signal: current.signal });
            if (!response.ok) throw new Error(String(response.status));
            return (await response.json()) as {
              items: CruisingSpotSummary[];
              truncated: boolean;
            };
          }),
        );
        setSpots(results.reduce<CruisingSpotSummary[]>((all, r) => mergeSpots(all, r.items), []));
        setLoad({ status: 'ready', truncated: results.some((result) => result.truncated) });
      } catch (error) {
        if (current.signal.aborted) return;
        setLoad({ status: 'error', truncated: false });
        console.warn('Cruising: the spots could not be loaded', error);
      }
    };
    reload.current = () => {
      clearTimeout(timer);
      void fetchView();
    };

    const onMoveEnd = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchView(), MOVE_DELAY_MS);
    };
    const onClick = (event: L.LeafletMouseEvent) => {
      const point = event.latlng.wrap();
      const lat = roundCoordinate(point.lat);
      const lng = roundCoordinate(point.lng);
      const box = document.createElement('div');
      box.className = styles.popup ?? '';
      const link = document.createElement('a');
      link.href = `${proposeBase}?lat=${lat}&lng=${lng}`;
      link.textContent = labelsRef.current.propose;
      link.className = styles.popupLink ?? '';
      const note = document.createElement('p');
      note.textContent = labelsRef.current.proposeNote;
      box.append(link, note);
      L.popup().setLatLng(point).setContent(box).openOn(map);
    };
    map.on('moveend', onMoveEnd);
    map.on('click', onClick);
    void fetchView();

    return () => {
      clearTimeout(timer);
      inflight.controller?.abort();
      map.off('moveend', onMoveEnd);
      map.off('click', onClick);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [endpoint, proposeBase, startLat, startLng, startZoom]);

  // The markers, whenever the spots in view change.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const spot of spots) {
      const marker = L.marker([spot.lat, spot.lng], {
        icon: spotIcon(spot.type),
        title: spot.name,
        alt: `${spot.name} (${typeNamesRef.current(spot.type)})`,
        keyboard: true,
      });
      marker.bindPopup(() => {
        const text = labelsRef.current;
        const box = document.createElement('div');
        box.className = styles.popup ?? '';
        const name = document.createElement('strong');
        name.textContent = spot.name;
        const meta = document.createElement('p');
        meta.textContent = `${typeNamesRef.current(spot.type)} · ${
          spot.ratingCount > 0
            ? `${formatRating(spot.ratingAvg)} (${text.reviews(spot.ratingCount)})`
            : text.noReviews
        }`;
        const link = document.createElement('a');
        link.href = `${spotBase}${spot.slug}`;
        link.textContent = text.view;
        link.className = styles.popupLink ?? '';
        box.append(name, meta, link);
        return box;
      });
      layer.addLayer(marker);
    }
  }, [spots, spotBase]);

  function changeType(value: string) {
    setType(value);
    typeRef.current = value;
    reload.current();
  }

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setLocate('unsupported');
      return;
    }
    setLocate('busy');
    // The position only centres the map in this browser; it is never sent to any server.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.setView([position.coords.latitude, position.coords.longitude], 13);
        setLocate('idle');
      },
      () => setLocate('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className={styles.mapWrap}>
      <div className={styles.mapControls}>
        <div className={styles.mapFilter}>
          <label htmlFor={filterId}>{t('filter')}</label>
          <select
            id={filterId}
            value={type}
            onChange={(event) => changeType(event.target.value)}
            className={styles.select}
          >
            <option value="">{t('allTypes')}</option>
            {SPOT_TYPES.map((value) => (
              <option key={value} value={value}>
                {tt(value)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={styles.mapButton}
          onClick={locateMe}
          disabled={locate === 'busy'}
        >
          {locate === 'busy' ? t('locating') : t('locate')}
        </button>
        <output className={styles.mapStatus}>
          {load.status === 'loading' ? t('loading') : null}
          {load.status === 'error' ? t('loadError') : null}
          {load.status === 'ready' && load.truncated ? t('truncated') : null}
          {load.status === 'ready' && !load.truncated ? t('count', { count: spots.length }) : null}
        </output>
      </div>
      {locate === 'denied' || locate === 'unsupported' ? (
        <p className={styles.mapNotice} role="alert">
          {t(locate === 'denied' ? 'locateDenied' : 'locateUnsupported')}
        </p>
      ) : null}
      <p className={styles.mapHint}>{t('locateNote')}</p>
      <section ref={container} className={styles.map} aria-label={t('mapLabel')} />
      <ul className={styles.legend} aria-label={t('legend')}>
        {SPOT_TYPES.map((value) => (
          <li key={value}>
            <span className={`${styles.legendMark} ${styles[`marker${value}`] ?? ''}`}>
              {TYPE_GLYPH[value]}
            </span>{' '}
            {tt(value)}
          </li>
        ))}
      </ul>
      {spots.length > 0 ? (
        <details className={styles.inView}>
          <summary>{t('listInView', { count: spots.length })}</summary>
          <ul>
            {spots.slice(0, 50).map((spot) => (
              <li key={spot.id}>
                <a href={`${spotBase}${spot.slug}`}>{spot.name}</a> · {tt(spot.type)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
