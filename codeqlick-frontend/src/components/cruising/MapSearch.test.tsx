import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SearchResults, type SearchResultsLabels } from './MapSearch';

const labels: SearchResultsLabels = {
  places: 'Cities',
  spots: 'Spots',
  empty: 'Nothing found for “zz”.',
  placeCount: (count) => `${count} spots`,
};

const spot = {
  id: '1',
  slug: 'faro-nandu',
  name: 'Faro Ñandú',
  type: 'PARK' as const,
  lat: 36.7,
  lng: -4.4,
  ratingAvg: 0,
  ratingCount: 0,
};

const place = {
  countryCode: 'ES',
  city: 'Málaga',
  citySlug: 'malaga',
  count: 3,
  bbox: [-4.5, 36.6, -4.3, 36.75] as [number, number, number, number],
};

describe('SearchResults', () => {
  it('lists cities as buttons and spots as links to their page', () => {
    const html = renderToStaticMarkup(
      <SearchResults
        result={{ places: [place], spots: [spot] }}
        locale="en"
        spotBase="/en/spots/"
        labels={labels}
        onPlace={() => undefined}
      />,
    );
    expect(html).toMatch(/<button type="button"[^>]*><span>Málaga, Spain<\/span>/);
    expect(html).toContain('3 spots');
    expect(html).toContain('href="/en/spots/faro-nandu"');
    expect(html).toContain('>Faro Ñandú</a>');
    expect(html).not.toContain('Nothing found');
  });

  it('says when nothing was found', () => {
    const html = renderToStaticMarkup(
      <SearchResults
        result={{ places: [], spots: [] }}
        locale="en"
        spotBase="/en/spots/"
        labels={labels}
        onPlace={() => undefined}
      />,
    );
    expect(html).toContain('Nothing found for “zz”.');
    expect(html).not.toContain('Cities');
  });
});
