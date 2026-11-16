import { describe, expect, it } from 'vitest';
import { spotImportFormat } from './cruising';

describe('spotImportFormat', () => {
  it('reads the format from the file name, any case', () => {
    expect(spotImportFormat('spots.csv', '')).toBe('csv');
    expect(spotImportFormat('Spots.CSV', null)).toBe('csv');
    expect(spotImportFormat('madrid.geojson', undefined)).toBe('geojson');
    expect(spotImportFormat('export.json', '')).toBe('geojson');
  });

  it('prefers the format chosen', () => {
    expect(spotImportFormat('spots.txt', 'csv')).toBe('csv');
    expect(spotImportFormat('spots.csv', 'geojson')).toBe('geojson');
  });

  it('is null when neither says', () => {
    expect(spotImportFormat('spots.txt', '')).toBeNull();
    expect(spotImportFormat('spots', 'kml')).toBeNull();
  });
});
