import { describe, expect, it } from 'vitest';
import { cloudSlug, describeRebuild, formatBytes, parseRebuildForm, weekdayName } from './cloud';

describe('formatBytes', () => {
  it('picks the unit and the decimals', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(1536, 'es')).toBe('1,5 KB');
    expect(formatBytes(1024 * 1024 * 1024, 'en')).toBe('1 GB');
    expect(formatBytes(150 * 1024 * 1024, 'en')).toBe('150 MB');
  });
});

describe('cloudSlug', () => {
  it('makes an address from a name', () => {
    expect(cloudSlug('Mi Web Ñandú!', 40)).toBe('mi-web-nandu');
    expect(cloudSlug('  --Docs--  ', 40)).toBe('docs');
    expect(cloudSlug('a'.repeat(50), 40)).toHaveLength(40);
  });
});

describe('parseRebuildForm', () => {
  it('sends only the fields the frequency uses', () => {
    const form = { minute: '30', hour: '6', weekday: '3' };
    expect(parseRebuildForm({ ...form, frequency: 'off' })).toEqual({
      ok: true,
      body: { frequency: 'off' },
    });
    expect(parseRebuildForm({ ...form, frequency: 'hourly' })).toEqual({
      ok: true,
      body: { frequency: 'hourly', minute: 30 },
    });
    expect(parseRebuildForm({ ...form, frequency: 'daily' })).toEqual({
      ok: true,
      body: { frequency: 'daily', minute: 30, hour: 6 },
    });
    expect(parseRebuildForm({ ...form, frequency: 'weekly' })).toEqual({
      ok: true,
      body: { frequency: 'weekly', minute: 30, hour: 6, weekday: 3 },
    });
  });

  it('ignores the fields the frequency does not use, even when wrong', () => {
    expect(parseRebuildForm({ frequency: 'hourly', minute: '0', hour: '99', weekday: '' })).toEqual(
      { ok: true, body: { frequency: 'hourly', minute: 0 } },
    );
  });

  it('reports missing and out-of-range fields', () => {
    expect(parseRebuildForm({ frequency: 'every-minute' })).toEqual({
      ok: false,
      errors: { frequency: 'required' },
    });
    expect(parseRebuildForm({ frequency: 'weekly', minute: '', hour: '24', weekday: '0' })).toEqual(
      { ok: false, errors: { minute: 'required', hour: 'range', weekday: 'range' } },
    );
    expect(parseRebuildForm({ frequency: 'daily', minute: '1.5', hour: '-1' })).toEqual({
      ok: false,
      errors: { minute: 'range', hour: 'range' },
    });
  });
});

describe('weekdayName', () => {
  it('counts from Monday', () => {
    expect(weekdayName(1, 'en')).toBe('Monday');
    expect(weekdayName(7, 'en')).toBe('Sunday');
    expect(weekdayName(3, 'es')).toBe('miércoles');
  });
});

describe('describeRebuild', () => {
  const schedule = { minute: 30, hour: 6, weekday: 1 };
  it('gives the message key and its values', () => {
    expect(describeRebuild({ ...schedule, frequency: 'daily' }, 'en')).toEqual({
      key: 'daily',
      values: { minute: '30', time: '06:30', weekday: 'Monday' },
    });
    expect(describeRebuild({ ...schedule, frequency: 'weekly' }, 'es')?.values.weekday).toBe(
      'lunes',
    );
    expect(
      describeRebuild({ frequency: 'hourly', minute: 5, hour: null, weekday: null }, 'en'),
    ).toEqual({ key: 'hourly', values: { minute: '05', time: '', weekday: '' } });
  });

  it('is null when off or incomplete', () => {
    expect(describeRebuild({ ...schedule, frequency: 'off' }, 'en')).toBeNull();
    expect(describeRebuild({ ...schedule, hour: null, frequency: 'daily' }, 'en')).toBeNull();
  });
});
