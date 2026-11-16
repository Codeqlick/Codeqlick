'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type { CruisingPlaceMatch, CruisingSearch } from '@/lib/api/cruising';
import { countryName, SEARCH_MAX_LENGTH, searchText } from '@/lib/cruising';
import styles from './Cruising.module.css';

/** How long the box waits after the last key before it searches. */
const TYPE_DELAY_MS = 300;

export type SearchResultsLabels = {
  places: string;
  spots: string;
  empty: string;
  placeCount: (count: number) => string;
};

type SearchResultsProps = {
  result: CruisingSearch;
  locale: string;
  /** `/es/spots/`: the spot's slug follows. */
  spotBase: string;
  labels: SearchResultsLabels;
  onPlace: (place: CruisingPlaceMatch) => void;
};

/** What a search found: cities (a button fits the map to them) and spots (links to their page). */
export function SearchResults({ result, locale, spotBase, labels, onPlace }: SearchResultsProps) {
  if (result.places.length === 0 && result.spots.length === 0) {
    return <p className={styles.searchEmpty}>{labels.empty}</p>;
  }
  return (
    <div className={styles.searchResults}>
      {result.places.length > 0 ? (
        <section aria-label={labels.places}>
          <h2 className={styles.searchHeading}>{labels.places}</h2>
          <ul className={styles.searchList}>
            {result.places.map((place) => (
              <li key={`${place.countryCode}/${place.citySlug}`}>
                <button type="button" className={styles.searchItem} onClick={() => onPlace(place)}>
                  <span>
                    {place.city}, {countryName(place.countryCode, locale)}
                  </span>
                  <span className={styles.searchMeta}>{labels.placeCount(place.count)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {result.spots.length > 0 ? (
        <section aria-label={labels.spots}>
          <h2 className={styles.searchHeading}>{labels.spots}</h2>
          <ul className={styles.searchList}>
            {result.spots.map((spot) => (
              <li key={spot.id}>
                <a className={styles.searchItem} href={`${spotBase}${spot.slug}`}>
                  {spot.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type Found = { text: string; status: 'loading' | 'ready' | 'error'; result: CruisingSearch | null };

/**
 * The map's search box (decision 86): a city or a spot by name. Only the text goes to the route
 * handler, never the person's position. Choosing a city fits the map to it; a spot opens its page.
 */
export function MapSearch({
  endpoint,
  spotBase,
  onPlace,
}: {
  endpoint: string;
  spotBase: string;
  onPlace: (bbox: CruisingPlaceMatch['bbox']) => void;
}) {
  const t = useTranslations('Cruising.search');
  const locale = useLocale();
  const inputId = useId();
  const hintId = useId();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const text = searchText(query);

  useEffect(() => {
    if (!text) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setFound({ text, status: 'loading', result: null });
      try {
        const response = await fetch(`${endpoint}?${new URLSearchParams({ q: text })}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        setFound({ text, status: 'ready', result: (await response.json()) as CruisingSearch });
      } catch (error) {
        if (controller.signal.aborted) return;
        setFound({ text, status: 'error', result: null });
        console.warn('Cruising: the search failed', error);
      }
    }, TYPE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, text]);

  // Results of an older text are not shown while the new one is on its way.
  const current = text && found?.text === text ? found : null;

  return (
    <search className={styles.search}>
      <form onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={inputId} className={styles.searchLabel}>
          {t('label')}
        </label>
        <input
          id={inputId}
          type="search"
          className={styles.searchInput}
          value={query}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={t('placeholder')}
          autoComplete="off"
          aria-describedby={hintId}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
          }}
        />
        <p id={hintId} className={styles.mapHint}>
          {t('hint')}
        </p>
      </form>
      <div aria-live="polite">
        {current?.status === 'loading' ? (
          <p className={styles.mapStatus}>{t('searching')}</p>
        ) : null}
        {current?.status === 'error' ? <p className={styles.mapStatus}>{t('error')}</p> : null}
        {current?.status === 'ready' && current.result ? (
          <SearchResults
            result={current.result}
            locale={locale}
            spotBase={spotBase}
            labels={{
              places: t('places'),
              spots: t('spots'),
              empty: t('empty', { text: current.text }),
              placeCount: (count) => t('placeCount', { count }),
            }}
            onPlace={(place) => {
              onPlace(place.bbox);
              setQuery('');
            }}
          />
        ) : null}
      </div>
    </search>
  );
}
