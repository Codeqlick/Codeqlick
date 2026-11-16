'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { CruisingSpotSummary } from '@/lib/api/cruising';
import {
  activeCounts,
  boundsToBboxes,
  formatBbox,
  snapBbox,
  formatRating,
  mergeSpots,
  MIN_RATINGS,
  roundCoordinate,
  SPOT_TAGS,
  SPOT_TYPES,
  type Bbox,
  type CruisingSpotTag,
  type MapView,
} from '@/lib/cruising';
import styles from './Cruising.module.css';
import { activeSpotIcon, createMap, L, spotIcon, TYPE_GLYPH } from './leaflet-shared';
import { MapSearch } from './MapSearch';

type LeafletMapProps = {
  /** The BFF route that answers with the spots in a box (never the API itself). */
  endpoint: string;
  /** The BFF route of the search box. */
  searchEndpoint: string;
  /**
   * The BFF route of "active now", only for members who have entered; null otherwise, and then
   * nothing about presence is asked for or shown (decision 86).
   */
  activeEndpoint: string | null;
  /** `/es/spots/` (the spot's slug follows) and `/es/new` on this host. */
  spotBase: string;
  proposeBase: string;
  initial: MapView;
};

type Load = { status: 'loading' | 'ready' | 'error'; truncated: boolean };
type Locate = 'idle' | 'busy' | 'denied' | 'unsupported';

/** How long the map rests after moving before it asks for the spots in view. */
const MOVE_DELAY_MS = 350;
/** How often "active now" is asked again while the map stays still. */
const ACTIVE_EVERY_MS = 60_000;
/** The closest a chosen city is shown (a city with one spot would otherwise fill the screen). */
const PLACE_MAX_ZOOM = 14;

/**
 * The Leaflet map of /map. When it stops moving it asks the route handler for the spots in view;
 * a marker's popup links to the spot's page, and a click offers "Propose a spot here". "Locate me"
 * asks the browser for the position and only centres the map: nothing is sent anywhere.
 */
export default function LeafletMap({
  endpoint,
  searchEndpoint,
  activeEndpoint,
  spotBase,
  proposeBase,
  initial,
}: LeafletMapProps) {
  const t = useTranslations('Cruising.map');
  const tt = useTranslations('Cruising.types');
  const tg = useTranslations('Cruising.tags');
  const filterId = useId();
  const tagsId = useId();
  const ratingId = useId();
  const activeId = useId();
  const container = useRef<HTMLElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const reload = useRef<() => void>(() => undefined);
  const [type, setType] = useState('');
  const typeRef = useRef('');
  const [minRating, setMinRating] = useState('');
  const minRatingRef = useRef('');
  /** Phase 5 (decision 92): only spots with all of these tags. */
  const [tags, setTags] = useState<CruisingSpotTag[]>([]);
  const tagsRef = useRef<CruisingSpotTag[]>([]);
  const [activeOnly, setActiveOnly] = useState(false);
  /** Spot id → people there now, for entered members only. */
  const [active, setActive] = useState<Map<string, number>>(() => new Map());
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
    hereNow: (count: number) => t('hereNow', { count }),
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

    // The pending reload after a move and the request in flight (aborted by the next one). Kept as
    // properties: the handlers run after render, where reassigning a variable isn't allowed.
    const pending: {
      timer?: ReturnType<typeof setTimeout>;
      controller?: AbortController;
      activeController?: AbortController;
      cells?: Bbox[];
    } = {};

    // Who is where now, for the same grid cells as the spots: entered members only.
    const fetchActive = async () => {
      const cells = pending.cells;
      if (!activeEndpoint || !cells) return;
      pending.activeController?.abort();
      const current = new AbortController();
      pending.activeController = current;
      try {
        const results = await Promise.all(
          cells.map(async (box) => {
            const params = new URLSearchParams({ bbox: formatBbox(box) });
            const response = await fetch(`${activeEndpoint}?${params}`, {
              signal: current.signal,
            });
            if (!response.ok) throw new Error(String(response.status));
            return (await response.json()) as { items: { spotId: string; here: number }[] };
          }),
        );
        setActive(activeCounts(results));
      } catch (error) {
        if (current.signal.aborted) return;
        console.warn('Cruising: who is active now could not be loaded', error);
      }
    };

    const fetchView = async () => {
      const bounds = map.getBounds();
      const boxes = boundsToBboxes(
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      );
      // Whole grid cells only: a request never reveals where the view is centred.
      const cells = boxes.map((box) => snapBbox(box));
      pending.cells = cells;
      void fetchActive();
      pending.controller?.abort();
      const current = new AbortController();
      pending.controller = current;
      setLoad((state) => ({ ...state, status: 'loading' }));
      try {
        const results = await Promise.all(
          cells.map(async (box) => {
            const params = new URLSearchParams({ bbox: formatBbox(box) });
            if (typeRef.current) params.set('type', typeRef.current);
            if (minRatingRef.current) params.set('minRating', minRatingRef.current);
            if (tagsRef.current.length > 0) params.set('tags', tagsRef.current.join(','));
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
      clearTimeout(pending.timer);
      void fetchView();
    };

    const onMoveEnd = () => {
      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => void fetchView(), MOVE_DELAY_MS);
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
    const activeTimer = activeEndpoint
      ? setInterval(() => void fetchActive(), ACTIVE_EVERY_MS)
      : undefined;

    return () => {
      clearTimeout(pending.timer);
      clearInterval(activeTimer);
      pending.controller?.abort();
      pending.activeController?.abort();
      map.off('moveend', onMoveEnd);
      map.off('click', onClick);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [endpoint, activeEndpoint, proposeBase, startLat, startLng, startZoom]);

  // The markers, whenever the spots in view change.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const spot of spots) {
      const here = active.get(spot.id) ?? 0;
      if (activeOnly && here === 0) continue;
      const hereText = here > 0 ? `, ${labelsRef.current.hereNow(here)}` : '';
      const marker = L.marker([spot.lat, spot.lng], {
        icon: here > 0 ? activeSpotIcon(spot.type, here) : spotIcon(spot.type),
        title: spot.name,
        alt: `${spot.name} (${typeNamesRef.current(spot.type)}${hereText})`,
        keyboard: true,
        zIndexOffset: here > 0 ? 1000 : 0,
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
        box.append(name, meta);
        if (here > 0) {
          const now = document.createElement('p');
          now.className = styles.popupActive ?? '';
          now.textContent = text.hereNow(here);
          box.append(now);
        }
        box.append(link);
        return box;
      });
      layer.addLayer(marker);
    }
  }, [spots, spotBase, active, activeOnly]);

  function changeType(value: string) {
    setType(value);
    typeRef.current = value;
    reload.current();
  }

  function changeMinRating(value: string) {
    setMinRating(value);
    minRatingRef.current = value;
    reload.current();
  }

  function toggleTag(tag: CruisingSpotTag, on: boolean) {
    const next = SPOT_TAGS.filter((each) => (each === tag ? on : tagsRef.current.includes(each)));
    setTags(next);
    tagsRef.current = next;
    reload.current();
  }

  /** A city chosen in the search: the map shows the box around its spots. */
  function showPlace([minLng, minLat, maxLng, maxLat]: [number, number, number, number]) {
    mapRef.current?.fitBounds(
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { maxZoom: PLACE_MAX_ZOOM, padding: [24, 24] },
    );
  }

  const hereAt = (id: string) => active.get(id) ?? 0;
  const shown = activeOnly ? spots.filter((spot) => hereAt(spot.id) > 0) : spots;

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
      <MapSearch endpoint={searchEndpoint} spotBase={spotBase} onPlace={showPlace} />
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
        <div className={styles.mapFilter}>
          <label htmlFor={ratingId}>{t('minRating')}</label>
          <select
            id={ratingId}
            value={minRating}
            onChange={(event) => changeMinRating(event.target.value)}
            className={styles.select}
          >
            <option value="">{t('anyRating')}</option>
            {MIN_RATINGS.map((value) => (
              <option key={value} value={String(value)}>
                {t('ratingAtLeast', { rating: value })}
              </option>
            ))}
          </select>
        </div>
        <details className={styles.tagFilter}>
          <summary>
            {tags.length > 0 ? t('tagsChosen', { count: tags.length }) : t('tagsFilter')}
          </summary>
          <fieldset className={styles.tagFilterList}>
            <legend className={styles.srOnly}>{t('tagsLegend')}</legend>
            {SPOT_TAGS.map((tag) => (
              <div key={tag} className={styles.activeToggle}>
                <input
                  id={`${tagsId}-${tag}`}
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={(event) => toggleTag(tag, event.target.checked)}
                />
                <label htmlFor={`${tagsId}-${tag}`}>{tg(tag)}</label>
              </div>
            ))}
          </fieldset>
        </details>
        {activeEndpoint ? (
          <div className={styles.activeToggle}>
            <input
              id={activeId}
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
            />
            <label htmlFor={activeId}>{t('activeOnly')}</label>
          </div>
        ) : null}
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
          {load.status === 'ready' && !load.truncated && !activeOnly
            ? t('count', { count: spots.length })
            : null}
          {load.status === 'ready' && !load.truncated && activeOnly
            ? t('activeCount', { count: shown.length })
            : null}
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
        {activeEndpoint ? (
          <li>
            <span className={`${styles.legendMark} ${styles.legendActive}`} aria-hidden="true" />{' '}
            {t('activeLegend')}
          </li>
        ) : null}
      </ul>
      {shown.length > 0 ? (
        <details className={styles.inView}>
          <summary>{t('listInView', { count: shown.length })}</summary>
          <ul>
            {shown.slice(0, 50).map((spot) => (
              <li key={spot.id}>
                <a href={`${spotBase}${spot.slug}`}>{spot.name}</a> · {tt(spot.type)}
                {hereAt(spot.id) > 0 ? ` · ${t('hereNow', { count: hereAt(spot.id) })}` : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
