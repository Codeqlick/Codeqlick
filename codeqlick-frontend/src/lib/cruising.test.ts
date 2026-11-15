import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { OPTIONAL_SESSION_PATH, PROTECTED_PATH } from './auth/constants';
import {
  boundsToBboxes,
  CHECK_IN_HOURS,
  conversationHref,
  isLookingFor,
  isNickname,
  isUnread,
  LOOKING_FOR,
  memberHref,
  mergeMessages,
  messagesEndpoint,
  normalizeNickname,
  parseCheckInHours,
  PERSON_REPORT_REASONS,
  previewMessage,
  reportedNickname,
  reportTranscript,
  countryFromParam,
  countryName,
  cruisingPath,
  excerpt,
  formatBbox,
  formatRating,
  mapHref,
  mergeSpots,
  osmLink,
  parseBbox,
  parseCoordinate,
  parseMapView,
  parseSpotForm,
  placeHref,
  proposeHref,
  REPORT_REASONS,
  SPOT_TYPES,
  spotLinkSlug,
  spotsEndpoint,
  spotTypeFilter,
  summarizeReportTarget,
  TAKEDOWN_REASONS,
  toSpotInput,
  WORLD_VIEW,
} from './cruising';
import { ADULT_WEBAPPS, routeWebapp, switcherApps, WEBAPPS, webappForHost } from './webapps';

describe('Cruising as a web app', () => {
  it('is a web app and an 18+ one', () => {
    expect(WEBAPPS).toContain('cruising');
    expect(ADULT_WEBAPPS).toContain('cruising');
    expect(webappForHost('cruising.codeqlick.com')).toBe('cruising');
    expect(webappForHost('cruising.localhost:3000')).toBe('cruising');
  });

  it("leaves it out of the apps for everyone's menus and lists it last in the 18+ ones", () => {
    expect(switcherApps('meetings').map((item) => item.app)).not.toContain('cruising');
    expect(switcherApps('citas').map((item) => item.app)).not.toContain('cruising');
    expect(switcherApps('swipe').at(-1)).toEqual({ app: 'cruising', adult: true });
    expect(switcherApps('cruising').map((item) => item.app)).toContain('swipe');
    expect(switcherApps('cruising').map((item) => item.app)).not.toContain('cruising');
  });

  it("serves its pages at the host's short addresses", () => {
    const host = 'cruising.codeqlick.com';
    expect(routeWebapp('/es', host, 'https:')).toEqual({ action: 'rewrite', to: '/es/cruising' });
    expect(routeWebapp('/es/map', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/cruising/map',
    });
    expect(routeWebapp('/en/spots/el-parque-norte', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/en/cruising/spots/el-parque-norte',
    });
    expect(routeWebapp('/en/places/es/madrid', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/en/cruising/places/es/madrid',
    });
    // The map's data route (a BFF) answers on the same host.
    expect(routeWebapp('/es/api/spots', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/cruising/api/spots',
    });
    expect(routeWebapp('/es/login', host, 'https:')).toEqual({ action: 'pass' });
  });

  it('serves the social pages at short addresses too, and sends the long ones there', () => {
    const host = 'cruising.codeqlick.com';
    expect(routeWebapp('/es/me', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/cruising/me',
    });
    expect(routeWebapp('/en/members/pepe_88', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/en/cruising/members/pepe_88',
    });
    expect(routeWebapp('/es/messages', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/cruising/messages',
    });
    expect(routeWebapp('/es/messages/abc', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/cruising/messages/abc',
    });
    // The chat's polling route (a BFF) answers on the same host.
    expect(routeWebapp('/es/api/conversations/abc/messages', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/cruising/api/conversations/abc/messages',
    });
    expect(routeWebapp('/es/cruising/messages/abc', host, 'https:')).toEqual({
      action: 'redirect',
      to: '/es/messages/abc',
    });
    expect(routeWebapp('/es/cruising/me', 'codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://cruising.codeqlick.com/es/me',
    });
  });

  it('sends its old addresses, and the main host, to the short ones', () => {
    expect(routeWebapp('/es/cruising/map', 'cruising.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: '/es/map',
    });
    expect(routeWebapp('/es/cruising/map', 'codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://cruising.codeqlick.com/es/map',
    });
    expect(routeWebapp('/en/cruising', 'localhost:3000', 'http:')).toEqual({
      action: 'redirect',
      to: 'http://cruising.localhost:3000/en',
    });
    expect(routeWebapp('/es/blog', 'cruising.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/es/blog',
    });
  });

  it('protects the proposal pages only, and keeps the rest public', () => {
    for (const path of [
      '/es/cruising/new',
      '/es/cruising/my-spots',
      '/en/cruising/my-spots/3f1a2b4c',
      '/es/cruising/me',
      '/en/cruising/members/pepe_88',
      '/es/cruising/messages',
      '/es/cruising/messages/3f1a2b4c-0000-4000-8000-000000000000',
    ]) {
      expect(PROTECTED_PATH.test(path), path).toBe(true);
    }
    for (const path of [
      '/es/cruising',
      '/es/cruising/map',
      '/es/cruising/spots/the-beach',
      '/es/cruising/places/es',
      '/es/cruising/rules',
      '/es/cruising/takedown',
      '/es/cruising/newsletter',
      '/es/cruising/api/spots',
      '/es/cruising/membership',
      '/es/cruising/mexico',
    ]) {
      expect(PROTECTED_PATH.test(path), path).toBe(false);
      expect(OPTIONAL_SESSION_PATH.test(path), path).toBe(true);
    }
  });
});

describe('bounding boxes', () => {
  it('reads a box the API would accept', () => {
    expect(parseBbox('-3.8,40.3,-3.6,40.5')).toEqual({
      minLng: -3.8,
      minLat: 40.3,
      maxLng: -3.6,
      maxLat: 40.5,
    });
    expect(parseBbox('-180,-90,180,90')).not.toBeNull();
  });

  it('refuses what the API refuses', () => {
    for (const value of [
      null,
      undefined,
      '',
      '1,2,3',
      '1,2,3,4,5',
      'a,b,c,d',
      '1,,3,4',
      '-181,0,0,1',
      '0,0,181,1',
      '0,-91,1,0',
      '0,0,1,91',
      '5,0,1,1', // minLng >= maxLng
      '0,5,1,1', // minLat >= maxLat
      '1,1,1,2',
      'Infinity,0,1,1',
    ]) {
      expect(parseBbox(value), String(value)).toBeNull();
    }
  });

  it('writes a box the way it was read, with at most 4 decimals', () => {
    expect(formatBbox({ minLng: -3.8, minLat: 40.3, maxLng: -3.6, maxLat: 40.5 })).toBe(
      '-3.8,40.3,-3.6,40.5',
    );
    expect(formatBbox({ minLng: -3.123456, minLat: 40, maxLng: 10, maxLat: 41.00004 })).toBe(
      '-3.1235,40,10,41',
    );
    const box = parseBbox('-3.8,40.3,-3.6,40.5');
    expect(parseBbox(formatBbox(box!))).toEqual(box);
  });

  it("asks a map's view as one box when it stays inside the world", () => {
    expect(boundsToBboxes(-4, 40, -3, 41)).toEqual([
      { minLng: -4, minLat: 40, maxLng: -3, maxLat: 41 },
    ]);
  });

  it('asks a view across the antimeridian as two boxes', () => {
    expect(boundsToBboxes(170, -10, 190, 10)).toEqual([
      { minLng: 170, minLat: -10, maxLng: 180, maxLat: 10 },
      { minLng: -180, minLat: -10, maxLng: -170, maxLat: 10 },
    ]);
    expect(boundsToBboxes(-190, -10, -170, 10)).toEqual([
      { minLng: 170, minLat: -10, maxLng: 180, maxLat: 10 },
      { minLng: -180, minLat: -10, maxLng: -170, maxLat: 10 },
    ]);
  });

  it('wraps a view dragged into another copy of the world', () => {
    expect(boundsToBboxes(356, 0, 358, 1)).toEqual([
      { minLng: -4, minLat: 0, maxLng: -2, maxLat: 1 },
    ]);
  });

  it('asks the whole world when the view is as wide as it', () => {
    expect(boundsToBboxes(-300, -20, 300, 20)).toEqual([
      { minLng: -180, minLat: -20, maxLng: 180, maxLat: 20 },
    ]);
  });

  it('clamps latitudes and ignores nonsense', () => {
    expect(boundsToBboxes(0, -100, 10, 100)).toEqual([
      { minLng: 0, minLat: -90, maxLng: 10, maxLat: 90 },
    ]);
    expect(boundsToBboxes(Number.NaN, 0, 1, 1)).toEqual([]);
    // Every box it gives is one the API accepts.
    for (const [w, e] of [
      [170, 190],
      [-190, -170],
      [-10, 10],
      [350, 370],
    ] as const) {
      for (const box of boundsToBboxes(w, -5, e, 5)) {
        expect(parseBbox(formatBbox(box))).not.toBeNull();
      }
    }
  });

  it('merges spots without repeating one', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(mergeSpots([a], [a, b])).toEqual([a, b]);
    expect(mergeSpots([], [b, b])).toEqual([b]);
  });
});

describe('coordinates and the starting view', () => {
  it('reads coordinates typed with a point or a comma, rounded to 5 decimals', () => {
    expect(parseCoordinate('40.4168', 'lat')).toBe(40.4168);
    expect(parseCoordinate(' 40,41683219 ', 'lat')).toBe(40.41683);
    expect(parseCoordinate('-3.7038', 'lng')).toBe(-3.7038);
    expect(parseCoordinate('180', 'lng')).toBe(180);
  });

  it('refuses what is not a coordinate', () => {
    for (const [value, kind] of [
      ['', 'lat'],
      ['abc', 'lat'],
      ['91', 'lat'],
      ['-90.5', 'lat'],
      ['181', 'lng'],
      ['1e3', 'lng'],
      ['1.2.3', 'lat'],
      [null, 'lat'],
      [undefined, 'lng'],
    ] as const) {
      expect(parseCoordinate(value, kind), String(value)).toBeNull();
    }
  });

  it("starts on the world, or where a spot's link says", () => {
    expect(parseMapView({})).toEqual(WORLD_VIEW);
    expect(parseMapView({ lat: '40.4', lng: 'x' })).toEqual(WORLD_VIEW);
    expect(parseMapView({ lat: '40.4', lng: '-3.7' })).toEqual({
      center: [40.4, -3.7],
      zoom: 14,
      located: true,
    });
    expect(parseMapView({ lat: '40.4', lng: '-3.7', zoom: '99' }).zoom).toBe(18);
    expect(parseMapView({ lat: '40.4', lng: '-3.7', zoom: '9' }).zoom).toBe(9);
    expect(parseMapView({ lat: '40.4', lng: '-3.7', zoom: 'big' }).zoom).toBe(14);
  });
});

describe('addresses', () => {
  it("writes Cruising's addresses for its host and for the main one", () => {
    expect(cruisingPath('es', '/map', true)).toBe('/es/map');
    expect(cruisingPath('es', '/map', false)).toBe('/es/cruising/map');
    expect(cruisingPath('en', '/', true)).toBe('/en');
    expect(cruisingPath('en', '/', false)).toBe('/en/cruising');
    expect(cruisingPath('es', '/spots/', true)).toBe('/es/spots/');
    expect(spotsEndpoint('es', true)).toBe('/es/api/spots');
    expect(spotsEndpoint('es', false)).toBe('/es/cruising/api/spots');
  });

  it('writes links as the app routes (the Link shortens them on its host)', () => {
    expect(proposeHref(40.416776, -3.70379)).toBe('/cruising/new?lat=40.41678&lng=-3.70379');
    expect(mapHref(40.4, -3.7)).toBe('/cruising/map?lat=40.4&lng=-3.7&zoom=15');
    expect(placeHref('ES')).toBe('/cruising/places/es');
    expect(placeHref('ES', 'madrid')).toBe('/cruising/places/es/madrid');
  });

  it("reads a place page's country", () => {
    expect(countryFromParam('es')).toBe('ES');
    expect(countryFromParam('ES')).toBe('ES');
    expect(countryFromParam('esp')).toBeNull();
    expect(countryFromParam('e1')).toBeNull();
    expect(countryFromParam('../')).toBeNull();
  });

  it('names a country in the reader language, or gives the code back', () => {
    expect(countryName('ES', 'en')).toBe('Spain');
    expect(countryName('ES', 'es')).toBe('España');
    expect(countryName('zz-not-a-code', 'en')).toBe('zz-not-a-code');
  });

  it('links OpenStreetMap at a point', () => {
    expect(osmLink(40.4, -3.7)).toBe(
      'https://www.openstreetmap.org/?mlat=40.4&mlon=-3.7#map=17/40.4/-3.7',
    );
  });
});

describe('small helpers', () => {
  it('filters by a known type only', () => {
    expect(spotTypeFilter('BEACH')).toBe('BEACH');
    expect(spotTypeFilter('beach')).toBeNull();
    expect(spotTypeFilter('')).toBeNull();
    expect(spotTypeFilter(null)).toBeNull();
  });

  it('shortens a text for a description, at a word', () => {
    expect(excerpt('Short text.')).toBe('Short text.');
    const long = 'word '.repeat(80);
    const cut = excerpt(long, 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toContain('wor…');
  });

  it('writes a rating with one decimal', () => {
    expect(formatRating(4.25)).toBe('4.3');
    expect(formatRating(4)).toBe('4.0');
  });

  it("reads a removal request's spot link, a full address or just the slug", () => {
    expect(spotLinkSlug('https://cruising.codeqlick.com/es/spots/el-parque-norte')).toBe(
      'el-parque-norte',
    );
    expect(spotLinkSlug('el-parque-norte')).toBe('el-parque-norte');
    expect(spotLinkSlug('/en/spots/el-parque-norte/?utm=1#x')).toBe('el-parque-norte');
    expect(spotLinkSlug('')).toBeNull();
    expect(spotLinkSlug('https://example.com/Not A Slug')).toBeNull();
  });
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const GOOD = {
  name: ' Playa del Norte ',
  type: 'BEACH',
  lat: '40,4168',
  lng: '-3.7038',
  countryCode: 'ES',
  city: 'Madrid',
  description: 'A quiet stretch of sand, best out of season.',
  bestTimes: 'weekday evenings',
};

describe('the spot form', () => {
  it('reads a good proposal into the API body', () => {
    const { errors, data } = parseSpotForm(form(GOOD));
    expect(errors).toEqual({});
    expect(data).toEqual({
      name: 'Playa del Norte',
      type: 'BEACH',
      lat: 40.4168,
      lng: -3.7038,
      countryCode: 'ES',
      city: 'Madrid',
      description: 'A quiet stretch of sand, best out of season.',
      bestTimes: 'weekday evenings',
    });
    expect(toSpotInput(data)).toEqual(data);
  });

  it('leaves out an empty best times', () => {
    const { data } = parseSpotForm(form({ ...GOOD, bestTimes: '' }));
    expect(data).not.toHaveProperty('bestTimes');
  });

  it('names each wrong field, and keeps what was typed', () => {
    const { values, errors, data } = parseSpotForm(
      form({
        name: 'x',
        type: 'MOON',
        lat: '95',
        lng: 'west',
        countryCode: 'XX',
        city: '',
        description: 'short',
        bestTimes: 'x'.repeat(201),
      }),
    );
    expect(errors).toEqual({
      name: 'nameRequired',
      type: 'typeRequired',
      lat: 'latInvalid',
      lng: 'lngInvalid',
      countryCode: 'countryRequired',
      city: 'cityRequired',
      description: 'descriptionShort',
      bestTimes: 'bestTimesLong',
    });
    expect(values.name).toBe('x');
    expect(values.lat).toBe('95');
    expect(toSpotInput(data)).toBeNull();
  });

  it("doesn't take a spot name, description or city past the API's limits", () => {
    const { errors } = parseSpotForm(
      form({ ...GOOD, name: 'n'.repeat(81), city: 'c'.repeat(81), description: 'd'.repeat(1001) }),
    );
    expect(Object.keys(errors).toSorted()).toEqual(['city', 'description', 'name']);
  });

  it('lets an edit leave fields empty (the API changes only what it is sent)', () => {
    const { errors, data } = parseSpotForm(
      form({ ...GOOD, lat: '', lng: '', description: '' }),
      true,
    );
    expect(errors).toEqual({});
    expect(data).not.toHaveProperty('lat');
    expect(data).not.toHaveProperty('description');
    expect(data.name).toBe('Playa del Norte');
    expect(toSpotInput(data)).toBeNull();
    // Still checks what it is given.
    expect(parseSpotForm(form({ lat: '200' }), true).errors).toEqual({ lat: 'latInvalid' });
  });
});

describe('admin reports', () => {
  it("reads a spot's report", () => {
    expect(summarizeReportTarget({ id: 's', name: 'The beach', slug: 'the-beach' })).toEqual({
      spotName: 'The beach',
      spotSlug: 'the-beach',
      reviewText: null,
      reviewRating: null,
    });
    expect(summarizeReportTarget({ spot: { name: 'The beach', slug: 'the-beach' } }).spotName).toBe(
      'The beach',
    );
  });

  it("reads a review's report with its spot", () => {
    expect(
      summarizeReportTarget({
        review: { id: 'r', rating: 2, text: 'Not great', spot: { name: 'The beach', slug: 'b' } },
      }),
    ).toEqual({ spotName: 'The beach', spotSlug: 'b', reviewText: 'Not great', reviewRating: 2 });
  });

  it('copes with anything else', () => {
    for (const target of [null, undefined, 'x', 3, [], {}]) {
      expect(summarizeReportTarget(target).spotName).toBeNull();
    }
  });
});

/** Every key under `Cruising`, `AdminCruising` and the apps card, as `a.b.c` paths. */
function paths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('profiles, check-ins and messages', () => {
  it('accepts nicknames of 3 to 20 lower-case letters, digits and underscores', () => {
    for (const value of ['abc', 'pepe_88', 'a'.repeat(20), '_x_', '123']) {
      expect(isNickname(value), value).toBe(true);
    }
    for (const value of ['ab', 'a'.repeat(21), 'Pepe', 'pe pe', 'pepe-88', 'pepé', '', 'a/b']) {
      expect(isNickname(value), value).toBe(false);
    }
  });

  it('lower-cases and trims a typed nickname', () => {
    expect(normalizeNickname('  Pepe_88 ')).toBe('pepe_88');
    expect(normalizeNickname(null)).toBe('');
    expect(isNickname(normalizeNickname(' PEPE '))).toBe(true);
  });

  it('knows what a member can look for and how long a check-in lasts', () => {
    expect(LOOKING_FOR).toEqual(['CHAT', 'FRIENDS', 'DATES', 'FUN', 'GROUP']);
    expect(isLookingFor('FUN')).toBe(true);
    expect(isLookingFor('fun')).toBe(false);
    expect(CHECK_IN_HOURS).toEqual([1, 2, 3]);
    expect(parseCheckInHours('2')).toBe(2);
    for (const value of ['0', '4', '1.5', 'x', '', null, undefined]) {
      expect(parseCheckInHours(value), String(value)).toBeNull();
    }
  });

  it('writes the addresses of the social pages', () => {
    expect(memberHref('pepe_88')).toBe('/cruising/members/pepe_88');
    expect(conversationHref('abc')).toBe('/cruising/messages/abc');
    expect(messagesEndpoint('es', true, 'abc')).toBe('/es/api/conversations/abc/messages');
    expect(messagesEndpoint('en', false, 'abc')).toBe(
      '/en/cruising/api/conversations/abc/messages',
    );
  });

  it('merges messages without repeating one, in time order', () => {
    const a = { id: 'a', mine: true, text: 'hi', createdAt: '2026-11-15T10:00:00.000Z' };
    const b = { id: 'b', mine: false, text: 'hello', createdAt: '2026-11-15T10:00:05.000Z' };
    const c = { id: 'c', mine: true, text: 'how are you', createdAt: '2026-11-15T10:01:00.000Z' };
    expect(mergeMessages([a, c], [b, c])).toEqual([a, b, c]);
    expect(mergeMessages([], [])).toEqual([]);
  });

  it('shortens a last message for the list and reads the unread flag or count', () => {
    expect(previewMessage('Hello there')).toBe('Hello there');
    expect(previewMessage('word '.repeat(40), 30).endsWith('…')).toBe(true);
    expect(isUnread(true)).toBe(true);
    expect(isUnread(2)).toBe(true);
    expect(isUnread(0)).toBe(false);
    expect(isUnread(false)).toBe(false);
    expect(isUnread(undefined)).toBe(false);
  });

  it('reports a person or a conversation for the reasons of a review, never wrong information', () => {
    expect(PERSON_REPORT_REASONS).not.toContain('WRONG_INFO');
    expect(PERSON_REPORT_REASONS).toContain('MINOR');
    expect(PERSON_REPORT_REASONS).toContain('HARASSMENT');
  });

  it("reads a reported profile's nickname, whatever shape the API gave it", () => {
    expect(reportedNickname({ nickname: 'pepe_88' })).toBe('pepe_88');
    expect(reportedNickname({ profile: { nickname: 'ana' } })).toBe('ana');
    expect(reportedNickname(null)).toBeNull();
    expect(reportedNickname({ nickname: 3 })).toBeNull();
  });

  it("reads a conversation report's saved chat", () => {
    const lines = [
      { from: 'reporter', text: 'hi', at: '2026-11-15T10:00:00.000Z' },
      { mine: false, text: 'send me money', createdAt: '2026-11-15T10:01:00.000Z' },
      { text: 'no sender' },
      { from: 'reporter' },
      'junk',
    ];
    const expected = [
      { from: 'reporter', text: 'hi', at: '2026-11-15T10:00:00.000Z' },
      { from: 'reported', text: 'send me money', at: '2026-11-15T10:01:00.000Z' },
      { from: 'unknown', text: 'no sender', at: null },
    ];
    expect(reportTranscript(lines)).toEqual(expected);
    expect(reportTranscript({ transcript: lines })).toEqual(expected);
    expect(reportTranscript({ messages: lines })).toEqual(expected);
    expect(reportTranscript(undefined)).toEqual([]);
    expect(reportTranscript({ nickname: 'ana' })).toEqual([]);
  });
});

describe('translations', () => {
  it('have the same keys in English and Spanish', () => {
    for (const namespace of ['Cruising', 'AdminCruising'] as const) {
      expect(paths(es[namespace]).toSorted(), namespace).toEqual(paths(en[namespace]).toSorted());
    }
    expect(paths(es.Apps.cruising).toSorted()).toEqual(paths(en.Apps.cruising).toSorted());
    expect(Object.keys(es.AppSwitcher.apps.cruising)).toEqual(
      Object.keys(en.AppSwitcher.apps.cruising),
    );
    expect(en.Admin.nav.cruising).toBeTruthy();
    expect(es.Admin.nav.cruising).toBeTruthy();
  });

  it('name every profile choice and the social navigation', () => {
    for (const messages of [en, es]) {
      for (const value of LOOKING_FOR) {
        expect(messages.Cruising.lookingFor[value], value).toBeTruthy();
      }
      expect(messages.Cruising.nav.messages).toBeTruthy();
      expect(messages.Cruising.nav.profile).toBeTruthy();
    }
  });

  it('name every spot type, report reason and takedown reason', () => {
    for (const messages of [en, es]) {
      for (const type of SPOT_TYPES) expect(messages.Cruising.types[type], type).toBeTruthy();
      for (const reason of REPORT_REASONS) {
        expect(messages.Cruising.report.reasons[reason], reason).toBeTruthy();
      }
      for (const reason of TAKEDOWN_REASONS) {
        expect(messages.Cruising.report.reasons[reason], reason).toBeTruthy();
      }
    }
  });

  it('have no empty text and write Codeqlick the right way', () => {
    for (const messages of [en, es]) {
      for (const namespace of [messages.Cruising, messages.AdminCruising]) {
        const texts = JSON.stringify(namespace);
        expect(texts).not.toContain('""');
        const wrong = [...texts.matchAll(/codeqlick(?!\.com)/gi)]
          .map((match) => match[0])
          .filter((word) => word !== 'Codeqlick');
        expect(wrong).toEqual([]);
      }
    }
  });
});
