import { describe, expect, it } from 'vitest';
import { maskEmail } from '../auth/unsubscribe-token.js';
import {
  extendedEnd,
  formatAlertTime,
  hashToken,
  healthReminderDue,
  healthReminderNeeded,
  isValidTestMonth,
  makeStopToken,
  newToken,
  osmLink,
  timerAction,
  timerEnd,
  timerFinishedAt,
  verifyStopToken,
  visibleHealth,
} from './cruising-safety.rules.js';
import {
  groupPlaces,
  importFlag,
  parseHealthCentersCsv,
  parseHealthCentersGeojson,
} from './cruising.rules.js';

const NOW = new Date('2026-11-16T20:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const SECRET = 'a-secret-of-at-least-thirty-two-characters!';
const CONTACT = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('the "Check on me" timer (decision 95)', () => {
  it('ends the chosen minutes after it starts', () => {
    expect(timerEnd(30, NOW)).toEqual(minutes(30));
    expect(timerEnd(360, NOW)).toEqual(minutes(360));
  });

  it('extends from its end, or from now once that passed, never past 6 hours from now', () => {
    expect(extendedEnd(minutes(20), 30, NOW)).toEqual(minutes(50));
    expect(extendedEnd(minutes(-5), 30, NOW)).toEqual(minutes(30));
    expect(extendedEnd(minutes(300), 60, NOW)).toEqual(minutes(360));
    expect(extendedEnd(minutes(300), 61, NOW)).toBeNull();
  });

  const running = { warnedAt: null, firedAt: null, endedAt: null };

  it('warns once in the last 10 minutes and fires once when it runs out', () => {
    expect(timerAction({ ...running, endsAt: minutes(11) }, NOW)).toBeNull();
    expect(timerAction({ ...running, endsAt: minutes(10) }, NOW)).toBe('warn');
    expect(timerAction({ ...running, endsAt: minutes(1), warnedAt: NOW }, NOW)).toBeNull();
    expect(timerAction({ ...running, endsAt: NOW }, NOW)).toBe('fire');
    // Never warned (the check was down): it still fires.
    expect(timerAction({ ...running, endsAt: minutes(-3) }, NOW)).toBe('fire');
  });

  it('does nothing once ended or fired', () => {
    expect(timerAction({ ...running, endsAt: minutes(-1), endedAt: minutes(-2) }, NOW)).toBeNull();
    expect(timerAction({ ...running, endsAt: minutes(-1), firedAt: NOW }, NOW)).toBeNull();
  });

  it('is over when ended early or when its end passed', () => {
    expect(timerFinishedAt({ endsAt: minutes(30), endedAt: minutes(10) })).toEqual(minutes(10));
    expect(timerFinishedAt({ endsAt: minutes(30), endedAt: null })).toEqual(minutes(30));
  });

  it('links a shared spot to OpenStreetMap', () => {
    expect(osmLink(40.4, -3.7)).toBe(
      'https://www.openstreetmap.org/?mlat=40.4&mlon=-3.7#map=17/40.4/-3.7',
    );
  });

  it('prints the time in UTC in the contact language', () => {
    expect(formatAlertTime(NOW, 'en')).toBe('16 November 2026 at 20:00 UTC');
    expect(formatAlertTime(NOW, 'es')).toMatch(/^16 de noviembre de 2026.*20:00 UTC$/);
  });
});

describe('trusted contacts tokens', () => {
  it('stores invitation tokens hashed, random each time', () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('signs stop links that work at any time, and refuses forged ones', () => {
    const token = makeStopToken(CONTACT, SECRET);
    expect(verifyStopToken(token, SECRET)).toBe(CONTACT);
    expect(verifyStopToken(token, `${SECRET}x`)).toBeNull();
    const other = '00000000-0000-4000-8000-000000000000';
    expect(verifyStopToken(token.replace(CONTACT, other), SECRET)).toBeNull();
    expect(verifyStopToken('stop.nope.sig', SECRET)).toBeNull();
    expect(verifyStopToken(newToken(), SECRET)).toBeNull();
  });

  it('masks a contact address', () => {
    expect(maskEmail('friend@example.com')).toBe('f***@example.com');
  });
});

describe('sexual health (decision 94)', () => {
  it('takes a YYYY-MM from 2000 to the current month', () => {
    expect(isValidTestMonth('2026-11', NOW)).toBe(true);
    expect(isValidTestMonth('2026-01', NOW)).toBe(true);
    expect(isValidTestMonth('2026-12', NOW)).toBe(false);
    expect(isValidTestMonth('2027-01', NOW)).toBe(false);
    expect(isValidTestMonth('1999-12', NOW)).toBe(false);
    expect(isValidTestMonth('2026-13', NOW)).toBe(false);
    expect(isValidTestMonth('2026-1', NOW)).toBe(false);
  });

  it('is due on the first day of the month 3 or 6 months after the test', () => {
    expect(healthReminderDue('2026-08', 3)).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(healthReminderDue('2026-09', 6)).toEqual(new Date('2027-03-01T00:00:00.000Z'));
    expect(healthReminderDue('nope', 3)).toBeNull();
  });

  const on = {
    healthConsentAt: new Date('2026-01-01T00:00:00Z'),
    lastTestedMonth: '2026-08',
    reminderMonths: 3,
    healthRemindedAt: null,
  };

  it('reminds once per due date, only with reminders on', () => {
    expect(healthReminderNeeded(on, NOW)).toBe(true);
    expect(healthReminderNeeded({ ...on, healthRemindedAt: NOW }, NOW)).toBe(false);
    // Reminded for an earlier due date: this one is new.
    expect(
      healthReminderNeeded({ ...on, healthRemindedAt: new Date('2026-05-02T00:00:00Z') }, NOW),
    ).toBe(true);
    expect(healthReminderNeeded({ ...on, lastTestedMonth: '2026-09' }, NOW)).toBe(false);
    expect(healthReminderNeeded({ ...on, reminderMonths: null }, NOW)).toBe(false);
    expect(healthReminderNeeded({ ...on, healthConsentAt: null }, NOW)).toBe(false);
  });

  it('shows the fields to others only when on and visible', () => {
    const profile = {
      healthConsentAt: NOW,
      healthVisible: true,
      prepStatus: 'ON_PREP' as const,
      lastTestedMonth: '2026-10',
    };
    expect(visibleHealth(profile)).toEqual({ prepStatus: 'ON_PREP', lastTestedMonth: '2026-10' });
    expect(visibleHealth({ ...profile, healthVisible: false })).toBeNull();
    expect(visibleHealth({ ...profile, healthConsentAt: null })).toBeNull();
    expect(visibleHealth({ ...profile, prepStatus: null, lastTestedMonth: null })).toBeNull();
  });
});

describe('the testing centres import', () => {
  it('reads yes/no cells in English and Spanish', () => {
    expect(importFlag('Yes')).toBe(true);
    expect(importFlag('sí')).toBe(true);
    expect(importFlag('1')).toBe(true);
    expect(importFlag('no')).toBe(false);
    expect(importFlag('')).toBe(false);
    expect(importFlag(undefined)).toBe(false);
    expect(importFlag(true)).toBe(true);
    expect(importFlag('maybe')).toBe('maybe');
  });

  it('reads a CSV with the optional columns left out', () => {
    const parsed = parseHealthCentersCsv(
      'Name;Address;Lat;Lng;Country code;City;Free\nCheckpoint;Calle 1;40,4168;-3,7038;es;Madrid;sí\n',
    );
    expect(parsed).toEqual({
      ok: true,
      rows: [
        {
          row: 2,
          fields: {
            name: 'Checkpoint',
            address: 'Calle 1',
            lat: 40.4168,
            lng: -3.7038,
            countryCode: 'ES',
            city: 'Madrid',
            url: null,
            phone: null,
            free: true,
            anonymous: false,
            rapid: false,
          },
        },
      ],
    });
  });

  it('names the missing required columns', () => {
    expect(parseHealthCentersCsv('name,lat,lng\nA,1,2')).toEqual({
      ok: false,
      error: 'The header row lacks the columns address, countryCode, city',
    });
  });

  it('reads GeoJSON points', () => {
    const parsed = parseHealthCentersGeojson(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [2.17, 41.38] },
            properties: {
              name: 'BCN Checkpoint',
              address: 'C/ 2',
              countryCode: 'ES',
              city: 'Barcelona',
              rapid: true,
            },
          },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
        ],
      }),
    );
    expect(parsed.ok && parsed.rows[0]?.fields).toMatchObject({
      name: 'BCN Checkpoint',
      lat: 41.38,
      lng: 2.17,
      rapid: true,
      free: false,
    });
    expect(parsed.ok && parsed.rows[1]).toEqual({
      row: 1,
      fields: null,
      error: 'Not a Point feature',
    });
  });

  it('groups places by country and city, most first', () => {
    expect(
      groupPlaces([
        { countryCode: 'ES', citySlug: 'madrid', city: 'Madrid', count: 2 },
        { countryCode: 'ES', citySlug: 'madrid', city: 'madrid', count: 1 },
        { countryCode: 'PT', citySlug: 'lisboa', city: 'Lisboa', count: 1 },
      ]),
    ).toEqual([
      { countryCode: 'ES', count: 3, cities: [{ city: 'Madrid', citySlug: 'madrid', count: 3 }] },
      { countryCode: 'PT', count: 1, cities: [{ city: 'Lisboa', citySlug: 'lisboa', count: 1 }] },
    ]);
  });
});
