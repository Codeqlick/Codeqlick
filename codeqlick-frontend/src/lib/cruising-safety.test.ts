import { describe, expect, it } from 'vitest';
import {
  contactLinkKind,
  currentMonth,
  formatMinutes,
  formatMonth,
  groupCenters,
  isValidTestMonth,
  minutesLeft,
  parseCenterForm,
  parseContactForm,
  parseHealthForm,
  parseTimerForm,
  type HealthCenter,
} from './cruising-safety';

const NOW = new Date('2026-11-16T20:00:00.000Z');
const SPOT = '33333333-3333-4333-8333-333333333333';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe('trusted contacts', () => {
  it('needs a valid email and a name of up to 40 characters', () => {
    expect(parseContactForm(form({ email: ' a@b.co ', displayName: ' Luis ' }))).toEqual({
      values: { email: 'a@b.co', displayName: 'Luis' },
      errors: {},
    });
    expect(parseContactForm(form({ email: 'nope', displayName: '' })).errors).toEqual({
      email: 'invalid',
      displayName: 'required',
    });
    expect(parseContactForm(form({ email: 'a@b.co', displayName: 'x'.repeat(41) })).errors).toEqual(
      { displayName: 'invalid' },
    );
  });

  it('tells a stop link from an invitation', () => {
    expect(contactLinkKind('stop.abc.def')).toBe('stop');
    expect(contactLinkKind('Zm9vYmFy')).toBe('invite');
    expect(contactLinkKind('  ')).toBeNull();
    expect(contactLinkKind('x'.repeat(201))).toBeNull();
  });
});

describe('the timer form', () => {
  it('takes a length from the list and the spot only when shared', () => {
    expect(parseTimerForm(form({ minutes: '90', message: ' Beach ', spotId: SPOT }))).toEqual({
      ok: true,
      input: { minutes: 90, message: 'Beach', shareSpot: false },
    });
    expect(
      parseTimerForm(form({ minutes: '30', message: '', shareSpot: 'on', spotId: SPOT })),
    ).toEqual({ ok: true, input: { minutes: 30, message: null, shareSpot: true, spotId: SPOT } });
  });

  it('refuses other lengths, long messages and a shared spot without one', () => {
    expect(parseTimerForm(form({ minutes: '45' }))).toEqual({ ok: false, error: 'minutes' });
    expect(parseTimerForm(form({ minutes: '60', message: 'x'.repeat(201) }))).toEqual({
      ok: false,
      error: 'message',
    });
    expect(parseTimerForm(form({ minutes: '60', shareSpot: 'on' }))).toEqual({
      ok: false,
      error: 'spot',
    });
  });

  it('counts down by whole minutes', () => {
    const now = NOW.getTime();
    expect(minutesLeft('2026-11-16T20:30:00.000Z', now)).toBe(30);
    expect(minutesLeft('2026-11-16T20:00:01.000Z', now)).toBe(1);
    expect(minutesLeft('2026-11-16T19:59:00.000Z', now)).toBe(0);
    expect(formatMinutes(65)).toBe('1:05');
    expect(formatMinutes(360)).toBe('6:00');
  });
});

describe('sexual health', () => {
  it('takes a month from 2000 to now', () => {
    expect(isValidTestMonth('2026-11', NOW)).toBe(true);
    expect(isValidTestMonth('2026-12', NOW)).toBe(false);
    expect(isValidTestMonth('1999-12', NOW)).toBe(false);
    expect(isValidTestMonth('2026-13', NOW)).toBe(false);
    expect(currentMonth(NOW)).toBe('2026-11');
    expect(formatMonth('2026-10', 'en')).toBe('October 2026');
    expect(formatMonth('2026-10', 'es')).toBe('octubre de 2026');
  });

  it('turns off without a consent, and needs it to turn on the first time', () => {
    expect(parseHealthForm(form({}), true, NOW)).toEqual({ ok: true, input: { enabled: false } });
    expect(parseHealthForm(form({ enabled: 'on' }), false, NOW)).toEqual({
      ok: false,
      error: 'consent',
    });
    expect(
      parseHealthForm(
        form({
          enabled: 'on',
          consent: 'on',
          prepStatus: 'ON_PREP',
          lastTestedMonth: '2026-10',
          reminderMonths: '3',
          visible: 'on',
        }),
        false,
        NOW,
      ),
    ).toEqual({
      ok: true,
      input: {
        enabled: true,
        consent: true,
        prepStatus: 'ON_PREP',
        lastTestedMonth: '2026-10',
        visible: true,
        reminderMonths: 3,
      },
    });
  });

  it('refuses a future month and drops reminders without a test month', () => {
    expect(parseHealthForm(form({ enabled: 'on', lastTestedMonth: '2027-01' }), true, NOW)).toEqual(
      { ok: false, error: 'month' },
    );
    const parsed = parseHealthForm(form({ enabled: 'on', reminderMonths: '6' }), true, NOW);
    expect(parsed.ok && parsed.input.reminderMonths).toBeNull();
  });
});

describe('testing centres', () => {
  const center = (over: Partial<HealthCenter>): HealthCenter => ({
    id: 'a',
    name: 'B',
    address: 'C',
    lat: 1,
    lng: 2,
    countryCode: 'ES',
    city: 'Madrid',
    citySlug: 'madrid',
    url: null,
    phone: null,
    free: false,
    anonymous: false,
    rapid: false,
    ...over,
  });

  it('groups them as the places say, by name inside a city', () => {
    const groups = groupCenters(
      [center({ id: '1', name: 'Zeta' }), center({ id: '2', name: 'Alfa' })],
      {
        countries: [
          {
            countryCode: 'ES',
            count: 2,
            cities: [{ city: 'Madrid', citySlug: 'madrid', count: 2 }],
          },
        ],
      },
    );
    expect(groups[0]?.cities[0]?.items.map((item) => item.name)).toEqual(['Alfa', 'Zeta']);
  });

  it('reads the admin form, with comma decimals and the yes/no boxes', () => {
    const parsed = parseCenterForm(
      form({
        name: 'Checkpoint',
        address: 'Calle 1',
        lat: '40,41678',
        lng: '-3.70379',
        countryCode: 'ES',
        city: 'Madrid',
        url: 'https://example.com',
        free: 'on',
      }),
      ['ES'],
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toMatchObject({ lat: 40.41678, free: true, rapid: false, phone: null });
    expect(parseCenterForm(form({ name: 'x', lat: '91', url: 'ftp://x' }), ['ES']).errors).toEqual([
      'name',
      'address',
      'lat',
      'lng',
      'countryCode',
      'city',
      'url',
    ]);
  });
});
