import { SWIPE_COUNTRIES } from './countries';

/**
 * Cruising's pure helpers (architecture 4.15): spot types and reasons, the map's bounding boxes,
 * coordinates, the spot form's validation and the addresses the map asks. No server-only code, so
 * Client Components, Server Actions and unit tests share it.
 */

export const SPOT_TYPES = [
  'BEACH',
  'PARK',
  'FOREST',
  'REST_AREA',
  'SAUNA',
  'BAR_CLUB',
  'CINEMA',
  'OTHER',
] as const;
export type CruisingSpotType = (typeof SPOT_TYPES)[number];

/** Phase 5 (decision 92): what a spot offers or is like (`Cruising.tags` names them). */
export const SPOT_TAGS = [
  'NUDIST',
  'DAY',
  'NIGHT',
  'PARKING',
  'PUBLIC_TRANSPORT',
  'HARD_ACCESS',
  'LIT',
  'SECLUDED',
  'INDOOR',
  'ACCESSIBLE',
  'GLORY_HOLES',
  'DARKROOM',
] as const;
export type CruisingSpotTag = (typeof SPOT_TAGS)[number];

export function isSpotTag(value: unknown): value is CruisingSpotTag {
  return typeof value === 'string' && (SPOT_TAGS as readonly string[]).includes(value);
}

/** The known tags of a list, each once, in the catalogue's order. */
export function cleanTags(values: readonly unknown[]): CruisingSpotTag[] {
  return SPOT_TAGS.filter((tag) => values.includes(tag));
}

/** The map's tags filter from a query (`NUDIST,LIT`): the known ones, in order; [] for none. */
export function parseTagsFilter(value: string | null | undefined): CruisingSpotTag[] {
  return cleanTags((value ?? '').split(',').map((tag) => tag.trim().toUpperCase()));
}

/**
 * The tags as schema.org `amenityFeature` (decision 92): English names, the same for both
 * languages (they describe the place, not the page).
 */
export const TAG_AMENITY: Record<CruisingSpotTag, string> = {
  NUDIST: 'Nudist',
  DAY: 'Daytime',
  NIGHT: 'Night-time',
  PARKING: 'Parking',
  PUBLIC_TRANSPORT: 'Public transport',
  HARD_ACCESS: 'Hard to reach',
  LIT: 'Lit at night',
  SECLUDED: 'Secluded',
  INDOOR: 'Indoors',
  ACCESSIBLE: 'Wheelchair accessible',
  GLORY_HOLES: 'Glory holes',
  DARKROOM: 'Darkroom',
};

export function spotAmenities(
  tags: readonly CruisingSpotTag[],
): { '@type': 'LocationFeatureSpecification'; name: string; value: true }[] {
  return tags.map((tag) => ({
    '@type': 'LocationFeatureSpecification',
    name: TAG_AMENITY[tag],
    value: true,
  }));
}

/** Phase 5 (decision 93): the contributor badges (`Cruising.badges` names them). */
export const CONTRIBUTOR_BADGES = ['EXPLORER', 'GUIDE', 'HELPFUL', 'LOCAL'] as const;
export type ContributorBadge = (typeof CONTRIBUTOR_BADGES)[number];

/** The known badges of a payload, in the catalogue's order (an older API sends none). */
export function cleanBadges(values: readonly unknown[] | null | undefined): ContributorBadge[] {
  return CONTRIBUTOR_BADGES.filter((badge) => (values ?? []).includes(badge));
}

// ---- Busiest hours (phase 5, decision 89) -------------------------------------------------------

/** `days[day][hour]`, 0 = Monday, weights 0-100 against the busiest hour. */
export type WeekHours = number[][];

/** The busiest hours of the week, highest first (ties: earlier in the week), up to `count`. */
export function busiestHours(
  days: WeekHours,
  count = 3,
): { day: number; hour: number; value: number }[] {
  const slots: { day: number; hour: number; value: number }[] = [];
  days.forEach((hours, day) =>
    hours.forEach((value, hour) => {
      if (value > 0) slots.push({ day, hour, value });
    }),
  );
  return slots
    .toSorted((a, b) => b.value - a.value || a.day - b.day || a.hour - b.hour)
    .slice(0, count);
}

/** Each day's busiest hour, or null for a day with nothing counted. */
export function busiestHourOfDay(hours: readonly number[]): number | null {
  let best: number | null = null;
  hours.forEach((value, hour) => {
    if (value > 0 && (best === null || value > (hours[best] ?? 0))) best = hour;
  });
  return best;
}

/** `21:00–22:00`: an hour of the day as a span. */
export function hourSpan(hour: number): string {
  const pad = (value: number) => String(value % 24).padStart(2, '0');
  return `${pad(hour)}:00–${pad(hour + 1)}:00`;
}

/** The weekday's name, Monday = 0, in `locale`. */
export function weekdayName(day: number, locale: string, width: 'long' | 'short' = 'long'): string {
  // 2026-11-16 is a Monday.
  const date = new Date(Date.UTC(2026, 10, 16 + day, 12));
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(date);
}

/** Reasons for reporting a spot or a review (WRONG_INFO only on a spot, and with details). */
export const REPORT_REASONS = [
  'MINOR',
  'ILLEGAL',
  'DANGER',
  'WRONG_INFO',
  'HARASSMENT',
  'SPAM',
  'OTHER',
] as const;
/** Reasons only a profile or a photo/video can be reported for (phase 4, decision 87). */
export const CONSENT_REPORT_REASONS = ['NON_CONSENSUAL', 'STOLEN'] as const;
export type CruisingReportReason =
  (typeof REPORT_REASONS)[number] | (typeof CONSENT_REPORT_REASONS)[number];
/** Every reason there is, for the labels. */
export const ALL_REPORT_REASONS: readonly CruisingReportReason[] = [
  ...REPORT_REASONS,
  ...CONSENT_REPORT_REASONS,
];
/** What a review can be reported for: a wrong detail is about the place, not the person's words. */
export const REVIEW_REPORT_REASONS = REPORT_REASONS.filter((reason) => reason !== 'WRONG_INFO');

/** Why someone asks for a spot to be removed (the public form). */
export const TAKEDOWN_REASONS = [
  'MINOR',
  'ILLEGAL',
  'NON_CONSENSUAL',
  'STOLEN',
  'DANGER',
  'OTHER',
] as const;
export type CruisingTakedownReason = (typeof TAKEDOWN_REASONS)[number];

export const SPOT_STATUSES = ['PENDING', 'LIVE', 'REJECTED', 'HIDDEN', 'REMOVED'] as const;
export type CruisingSpotStatus = (typeof SPOT_STATUSES)[number];

/** Reasons for reporting a person or a conversation: like a review's, a wrong detail is about a place. */
export const PERSON_REPORT_REASONS = REVIEW_REPORT_REASONS;
/** A profile can also be reported for a missing consent or stolen pictures. */
export const PROFILE_REPORT_REASONS: readonly CruisingReportReason[] = [
  'MINOR',
  'NON_CONSENSUAL',
  'STOLEN',
  'ILLEGAL',
  'DANGER',
  'HARASSMENT',
  'SPAM',
  'OTHER',
];
/** A photo or video: no DANGER (about a place) and no WRONG_INFO. */
export const MEDIA_REPORT_REASONS: readonly CruisingReportReason[] = [
  'MINOR',
  'NON_CONSENSUAL',
  'STOLEN',
  'ILLEGAL',
  'HARASSMENT',
  'SPAM',
  'OTHER',
];

export const SUSPENSIONS = ['24h', '7d', '30d', 'permanent'] as const;
export type CruisingSuspension = (typeof SUSPENSIONS)[number];

/** Limits of the API (architecture 4.15). */
export const LIMITS = {
  name: 80,
  city: 80,
  description: 1000,
  bestTimes: 200,
  /** Phase 5 (decision 92). */
  openingHours: 200,
  tips: 500,
  review: 1000,
  details: 1000,
  rejectReason: 500,
  bio: 160,
  message: 1000,
  /** A removal request's media reference (8 characters). */
  mediaRef: 8,
} as const;

/** The countries a profile can name: the same fixed list as Swipe's and the spots'. */
export const CRUISING_COUNTRIES = SWIPE_COUNTRIES;

/** The most spots one map request returns (the API's cap). */
export const MAX_SPOTS = 500;

export function isSpotType(value: unknown): value is CruisingSpotType {
  return SPOT_TYPES.some((type) => type === value);
}

/** The `type` filter of a map request: one of the types, or null for all. */
export function spotTypeFilter(value: string | null | undefined): CruisingSpotType | null {
  return isSpotType(value) ? value : null;
}

// ---- Bounding boxes ----------------------------------------------------------------------------

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/**
 * A `minLng,minLat,maxLng,maxLat` query value, or null when it isn't one the API accepts: four
 * numbers, longitudes in −180..180, latitudes in −90..90, minimums below maximums.
 */
export function parseBbox(value: string | null | undefined): Bbox | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  if (!numbers.every((number) => Number.isFinite(number))) return null;
  const [minLng, minLat, maxLng, maxLat] = numbers as [number, number, number, number];
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

/** A box as the API's `bbox` value (4 decimals are about 11 m, plenty for a map view). */
export function formatBbox(box: Bbox): string {
  return [box.minLng, box.minLat, box.maxLng, box.maxLat]
    .map((number) => String(Number(number.toFixed(4))))
    .join(',');
}

/** The grid the map's requests are snapped to, in degrees (about 28 km of latitude). */
export const BBOX_GRID = 0.25;

/**
 * A box grown outwards to the whole cells of a coarse grid. What the map asks the API for then
 * says nothing about where the view (or a device that "located me") is inside the box: the
 * device's position never reaches the API, not even as the centre of a request (section 4.15).
 */
export function snapBbox(box: Bbox, step = BBOX_GRID): Bbox {
  const down = (value: number) => Math.floor(value / step) * step;
  const up = (value: number) => Math.ceil(value / step) * step;
  const minLng = clamp(down(box.minLng), -180, 180);
  const minLat = clamp(down(box.minLat), -90, 90);
  const maxLng = clamp(up(box.maxLng), -180, 180);
  const maxLat = clamp(up(box.maxLat), -90, 90);
  return {
    minLng: maxLng > minLng ? minLng : Math.max(-180, maxLng - step),
    minLat: maxLat > minLat ? minLat : Math.max(-90, maxLat - step),
    maxLng: maxLng > minLng ? maxLng : Math.min(180, minLng + step),
    maxLat: maxLat > minLat ? maxLat : Math.min(90, minLat + step),
  };
}

function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The boxes to ask for a map's view. Leaflet's bounds go past ±180 when the world repeats or the
 * view is dragged across the antimeridian; the API takes one box inside −180..180, so a view
 * across it is asked for as two, and a view at least as wide as the world as one.
 */
export function boundsToBboxes(west: number, south: number, east: number, north: number): Bbox[] {
  if (![west, south, east, north].every(Number.isFinite)) return [];
  const minLat = clamp(Math.min(south, north), -90, 90);
  const maxLat = clamp(Math.max(south, north), -90, 90);
  const lat = { minLat, maxLat: maxLat > minLat ? maxLat : Math.min(90, minLat + 0.0001) };
  if (east - west >= 360) return [{ minLng: -180, maxLng: 180, ...lat }];
  const minLng = wrapLongitude(west);
  const maxLng = wrapLongitude(east);
  if (minLng < maxLng) return [{ minLng, maxLng, ...lat }];
  // Across the antimeridian (or exactly on it): east of the line and west of it.
  return [
    { minLng, maxLng: 180, ...lat },
    { minLng: -180, maxLng: maxLng > -180 ? maxLng : -179.9999, ...lat },
  ].filter((box) => box.minLng < box.maxLng);
}

/** Whether every corner of a box lies on the grid: the only boxes "active now" is asked for. */
export function isGridBbox(box: Bbox, step = BBOX_GRID): boolean {
  return [box.minLng, box.minLat, box.maxLng, box.maxLat].every(
    (value) => Math.abs(value / step - Math.round(value / step)) < 1e-9,
  );
}

/** The grid box around some spots (a city's), or null when there are none. */
export function gridBboxAround(spots: readonly { lat: number; lng: number }[]): Bbox | null {
  if (spots.length === 0) return null;
  const lngs = spots.map((spot) => spot.lng);
  const lats = spots.map((spot) => spot.lat);
  return snapBbox({
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats),
  });
}

// ---- Search, the rating filter and "active now" (phase 3, decision 86) -------------------------

/** What a search takes: 2 to 60 characters. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 60;

/** The text to search for (trimmed, spaces collapsed), or null when too short or too long. */
export function searchText(value: string | null | undefined): string | null {
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  return text.length >= SEARCH_MIN_LENGTH && text.length <= SEARCH_MAX_LENGTH ? text : null;
}

/** The map's minimum rating filter. */
export const MIN_RATINGS = [1, 2, 3, 4, 5] as const;
export type MinRating = (typeof MIN_RATINGS)[number];

export function parseMinRating(value: string | null | undefined): MinRating | null {
  const number = Number(value);
  return (MIN_RATINGS as readonly number[]).includes(number) ? (number as MinRating) : null;
}

/** "Active now" answers of the boxes of a view, as one map from spot to the people there. */
export function activeCounts(
  results: readonly { items: readonly { spotId: string; here: number }[] }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const result of results) {
    for (const item of result.items) {
      if (item.here > 0) counts.set(item.spotId, Math.max(counts.get(item.spotId) ?? 0, item.here));
    }
  }
  return counts;
}

/** The spots with someone there now, busiest first, each with how many. */
export function activeSpots<T extends { id: string }>(
  spots: readonly T[],
  counts: ReadonlyMap<string, number>,
): (T & { here: number })[] {
  return spots
    .flatMap((spot) => {
      const here = counts.get(spot.id) ?? 0;
      return here > 0 ? [{ ...spot, here }] : [];
    })
    .sort((a, b) => b.here - a.here);
}

/** Adds the spots not already listed (a view asked as two boxes, or panned back over itself). */
export function mergeSpots<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const known = new Set(current.map((spot) => spot.id));
  const added: T[] = [];
  for (const spot of incoming) {
    if (known.has(spot.id)) continue;
    known.add(spot.id);
    added.push(spot);
  }
  return [...current, ...added];
}

// ---- Coordinates and the map's starting view ---------------------------------------------------

/** Spots are stored with 5 decimals (about 1 m). */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/** A latitude or longitude typed or read from a link (`40,4168` and `40.4168` both work), or null. */
export function parseCoordinate(
  value: string | null | undefined,
  kind: 'lat' | 'lng',
): number | null {
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  const limit = kind === 'lat' ? 90 : 180;
  if (!Number.isFinite(number) || Math.abs(number) > limit) return null;
  return roundCoordinate(number);
}

export type MapView = { center: [number, number]; zoom: number; located: boolean };

/** The whole world, until the person asks for somewhere. */
export const WORLD_VIEW: MapView = { center: [30, 10], zoom: 2, located: false };

/** The starting view from `?lat=&lng=&zoom=` (a spot's "see it on the map"), else the world. */
export function parseMapView(params: {
  lat?: string | null;
  lng?: string | null;
  zoom?: string | null;
}): MapView {
  const lat = parseCoordinate(params.lat, 'lat');
  const lng = parseCoordinate(params.lng, 'lng');
  if (lat === null || lng === null) return WORLD_VIEW;
  const zoom = Number(params.zoom);
  return {
    center: [lat, lng],
    zoom: Number.isInteger(zoom) ? clamp(zoom, 2, 18) : 14,
    located: true,
  };
}

// ---- Addresses ---------------------------------------------------------------------------------

/**
 * An address of Cruising as the browser writes it: on Cruising's own host the app's name is left
 * out (`/es/map`), anywhere else it is part of the route (`/es/cruising/map`). The proxy serves
 * both (architecture 6.3).
 */
export function cruisingPath(locale: string, path: string, onHost: boolean): string {
  const rest = path === '/' ? '' : path;
  return onHost ? `/${locale}${rest}` : `/${locale}/cruising${rest}`;
}

/** What the map asks for the spots in view (the BFF route handler, never the API). */
export function spotsEndpoint(locale: string, onHost: boolean): string {
  return cruisingPath(locale, '/api/spots', onHost);
}

/** What the map's search box asks (the BFF route handler, never the API). */
export function searchEndpoint(locale: string, onHost: boolean): string {
  return cruisingPath(locale, '/api/search', onHost);
}

/** What the map asks for the spots with someone there now (entered members only). */
export function activeEndpoint(locale: string, onHost: boolean): string {
  return cruisingPath(locale, '/api/active', onHost);
}

/** A spot's page, a link to propose one at a point, and the map centred somewhere. */
export function spotHref(slug: string): string {
  return `/cruising/spots/${slug}`;
}

export function proposeHref(lat: number, lng: number): string {
  return `/cruising/new?lat=${roundCoordinate(lat)}&lng=${roundCoordinate(lng)}`;
}

export function mapHref(lat: number, lng: number, zoom = 15): string {
  return `/cruising/map?lat=${roundCoordinate(lat)}&lng=${roundCoordinate(lng)}&zoom=${zoom}`;
}

/** The place pages' addresses use lower-case country codes: `/places/es/madrid`. */
export function placeHref(countryCode: string, citySlug?: string): string {
  const base = `/cruising/places/${countryCode.toLowerCase()}`;
  return citySlug ? `${base}/${citySlug}` : base;
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTRY_PARAM = /^[a-z]{2}$/i;

/** A country from a place page's address (`es`), as the API's code (`ES`), or null. */
export function countryFromParam(value: string): string | null {
  return COUNTRY_PARAM.test(value) ? value.toUpperCase() : null;
}

/** A country's name in the reader's language; the code itself when the runtime doesn't know it. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** OpenStreetMap at a point, for the team to check the surroundings of a proposed spot. */
export function osmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** The start of a text for a meta description: whole words, an ellipsis when cut. */
export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, '')}…`;
}

/** The average rating for display: `4.3`. */
export function formatRating(average: number): string {
  return (Math.round(average * 10) / 10).toFixed(1);
}

// ---- The spot form -----------------------------------------------------------------------------

export type SpotInput = {
  name: string;
  type: CruisingSpotType;
  lat: number;
  lng: number;
  countryCode: string;
  city: string;
  description: string;
  bestTimes?: string;
  /** Phase 5 (decision 92); null clears them in an edit. */
  tags?: CruisingSpotTag[];
  openingHours?: string | null;
  tips?: string | null;
};

/** Keys of `Cruising.spotForm.errors`. */
export type SpotErrorKey =
  | 'nameRequired'
  | 'typeRequired'
  | 'latInvalid'
  | 'lngInvalid'
  | 'countryRequired'
  | 'cityRequired'
  | 'descriptionShort'
  | 'bestTimesLong'
  | 'openingHoursLong'
  | 'tipsLong';

/** A hidden field of the forms that show the tags: without it, the tags are left alone. */
export const TAGS_FIELD = 'tagsShown';

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reads the proposal form. `values` echoes what was typed (so a failed submit keeps it); `errors`
 * name the fields (and the message in `spotForm.errors`) when something is wrong; `data` is the
 * API body when nothing is. With `partial` (editing, when the page couldn't prefill a field) an
 * empty field is left out instead of being an error: the API changes only what is sent.
 */
export function parseSpotForm(
  formData: FormData,
  partial = false,
): {
  values: Record<string, string>;
  errors: Partial<Record<string, SpotErrorKey>>;
  data: Partial<SpotInput>;
} {
  const values = {
    name: field(formData, 'name'),
    type: field(formData, 'type'),
    lat: field(formData, 'lat'),
    lng: field(formData, 'lng'),
    countryCode: field(formData, 'countryCode'),
    city: field(formData, 'city'),
    description: field(formData, 'description'),
    bestTimes: field(formData, 'bestTimes'),
    openingHours: field(formData, 'openingHours'),
    tips: field(formData, 'tips'),
    // The ticked boxes, one per line (how the checkbox group reads them back).
    tags: formData
      .getAll('tags')
      .filter((value): value is string => typeof value === 'string')
      .join('\n'),
  };
  const errors: Partial<Record<string, SpotErrorKey>> = {};
  const data: Partial<SpotInput> = {};
  const skip = (name: keyof typeof values) => partial && values[name] === '';

  if (!skip('name')) {
    if (values.name.length < 3 || values.name.length > LIMITS.name) errors.name = 'nameRequired';
    else data.name = values.name;
  }
  if (!skip('type')) {
    if (!isSpotType(values.type)) errors.type = 'typeRequired';
    else data.type = values.type;
  }
  if (!skip('lat')) {
    const lat = parseCoordinate(values.lat, 'lat');
    if (lat === null) errors.lat = 'latInvalid';
    else data.lat = lat;
  }
  if (!skip('lng')) {
    const lng = parseCoordinate(values.lng, 'lng');
    if (lng === null) errors.lng = 'lngInvalid';
    else data.lng = lng;
  }
  if (!skip('countryCode')) {
    if (!SWIPE_COUNTRIES.some((code) => code === values.countryCode)) {
      errors.countryCode = 'countryRequired';
    } else data.countryCode = values.countryCode;
  }
  if (!skip('city')) {
    if (values.city.length < 2 || values.city.length > LIMITS.city) errors.city = 'cityRequired';
    else data.city = values.city;
  }
  if (!skip('description')) {
    if (values.description.length < 10 || values.description.length > LIMITS.description) {
      errors.description = 'descriptionShort';
    } else data.description = values.description;
  }
  if (values.bestTimes.length > LIMITS.bestTimes) errors.bestTimes = 'bestTimesLong';
  else if (values.bestTimes) data.bestTimes = values.bestTimes;
  // Phase 5: an emptied field clears it in an edit, and is left out of a new spot.
  for (const name of ['openingHours', 'tips'] as const) {
    if (!formData.has(name)) continue;
    const limit = name === 'openingHours' ? LIMITS.openingHours : LIMITS.tips;
    if (values[name].length > limit) errors[name] = `${name}Long`;
    else if (values[name]) data[name] = values[name];
    else if (partial) data[name] = null;
  }
  if (formData.has(TAGS_FIELD)) data.tags = cleanTags(formData.getAll('tags'));
  return { values, errors, data };
}

/** The API body of a proposal, or null when a required field is missing (a partial edit). */
export function toSpotInput(data: Partial<SpotInput>): SpotInput | null {
  const { name, type, lat, lng, countryCode, city, description, bestTimes, tags } = data;
  const { openingHours, tips } = data;
  if (
    name === undefined ||
    type === undefined ||
    lat === undefined ||
    lng === undefined ||
    countryCode === undefined ||
    city === undefined ||
    description === undefined
  ) {
    return null;
  }
  return {
    name,
    type,
    lat,
    lng,
    countryCode,
    city,
    description,
    ...(bestTimes ? { bestTimes } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(openingHours ? { openingHours } : {}),
    ...(tips ? { tips } : {}),
  };
}

/**
 * A removal request's spot link, as the API reads it (a URL ending in `/spots/<slug>`, or the
 * slug itself); null when it is neither.
 */
export function spotLinkSlug(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (SLUG.test(text)) return text;
  const segments = text
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean);
  const at = segments.lastIndexOf('spots');
  const slug = at >= 0 ? segments[at + 1] : undefined;
  return slug && SLUG.test(slug) ? slug : null;
}

// ---- Admin reports -----------------------------------------------------------------------------

/** What the team needs to see of a report's target, whatever shape the API gave it. */
export type ReportTargetSummary = {
  spotName: string | null;
  spotSlug: string | null;
  reviewText: string | null;
  reviewRating: number | null;
};

/** Reads the `target` of an admin report defensively: a spot, or a review with its spot. */
export function summarizeReportTarget(target: unknown): ReportTargetSummary {
  const object = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  const root = object(target);
  const review = object(root?.review);
  const spot = object(review?.spot) ?? object(root?.spot) ?? (review ? null : root);
  return {
    spotName: text(spot?.name),
    spotSlug: text(spot?.slug),
    reviewText: text(review?.text),
    reviewRating: typeof review?.rating === 'number' ? review.rating : null,
  };
}

// ---- Phase 2: profiles, check-ins and messages ---------------------------------------------------

/** What a member is looking for (any of them, on the profile). */
export const LOOKING_FOR = ['CHAT', 'FRIENDS', 'DATES', 'FUN', 'GROUP'] as const;
export type CruisingLookingFor = (typeof LOOKING_FOR)[number];

export function isLookingFor(value: unknown): value is CruisingLookingFor {
  return LOOKING_FOR.some((item) => item === value);
}

/** The hours a check-in can last. */
export const CHECK_IN_HOURS = [1, 2, 3] as const;
export type CheckInHours = (typeof CHECK_IN_HOURS)[number];

export function parseCheckInHours(value: unknown): CheckInHours | null {
  const hours = Number(value);
  return CHECK_IN_HOURS.find((item) => item === hours) ?? null;
}

/** A nickname: 3 to 20 characters, lower-case letters, digits and underscores. */
export const NICKNAME = /^[a-z0-9_]{3,20}$/;

/** What is saved of a typed nickname: trimmed and lower-cased (the API lower-cases it too). */
export function normalizeNickname(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function isNickname(value: string): boolean {
  return NICKNAME.test(value);
}

/** Messages each side sends in a conversation before contact details can be shared (the API's). */
export const SAFE_CHAT_MESSAGES = 5;

/** How often an open chat asks for new messages while it is visible. */
export const POLL_MS = 4000;

export type CruisingMessage = { id: string; mine: boolean; text: string; createdAt: string };

/** Adds the messages not already listed, in time order. */
export function mergeMessages(
  current: CruisingMessage[],
  incoming: CruisingMessage[],
): CruisingMessage[] {
  const known = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !known.has(message.id))].toSorted((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/** A member's profile page, and the messages' pages. */
export function memberHref(nickname: string): string {
  return `/cruising/members/${nickname}`;
}

export function conversationHref(id: string): string {
  return `/cruising/messages/${id}`;
}

/** What the chat asks for new messages (the BFF route handler, never the API). */
export function messagesEndpoint(locale: string, onHost: boolean, conversationId: string): string {
  return cruisingPath(locale, `/api/conversations/${conversationId}/messages`, onHost);
}

/** The text of a conversation's last message, cut for a list: whole words, an ellipsis when cut. */
export function previewMessage(text: string, max = 80): string {
  return excerpt(text, max);
}

/** My favourite spots (decision 85). */
export const FAVORITES_HREF = '/cruising/favorites';

/** Whether the spot is among my favourites. */
export function isFavorite(
  favorites: readonly { spot: { id: string } }[],
  spotId: string,
): boolean {
  return favorites.some((favorite) => favorite.spot.id === spotId);
}

/** Whether a conversation has unread messages (the API says it as a flag or a count). */
export function isUnread(unread: boolean | number | null | undefined): boolean {
  return typeof unread === 'number' ? unread > 0 : unread === true;
}

/** The profile of a report's target and a chat's saved lines, whatever shape the API gave them. */
export type TranscriptLine = {
  from: 'reporter' | 'reported' | 'unknown';
  text: string;
  at: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The nickname of a reported profile (`{ nickname }` or `{ profile: { nickname } }`), or null. */
export function reportedNickname(target: unknown): string | null {
  const root = asObject(target);
  const profile = asObject(root?.profile) ?? root;
  const nickname = profile?.nickname;
  return typeof nickname === 'string' ? nickname : null;
}

function lineFrom(item: Record<string, unknown>): TranscriptLine['from'] {
  if (item.from === 'reporter' || item.from === 'reported') return item.from;
  if (typeof item.mine === 'boolean') return item.mine ? 'reporter' : 'reported';
  return 'unknown';
}

/**
 * The saved chat of a conversation report: an array, or an object holding one as `transcript` or
 * `messages`. Lines without text are dropped.
 */
export function reportTranscript(target: unknown): TranscriptLine[] {
  const root = asObject(target);
  const list = Array.isArray(target)
    ? target
    : Array.isArray(root?.transcript)
      ? root.transcript
      : Array.isArray(root?.messages)
        ? root.messages
        : [];
  const lines: TranscriptLine[] = [];
  for (const entry of list) {
    const item = asObject(entry);
    if (!item || typeof item.text !== 'string') continue;
    const at =
      typeof item.at === 'string'
        ? item.at
        : typeof item.createdAt === 'string'
          ? item.createdAt
          : null;
    lines.push({ from: lineFrom(item), text: item.text, at });
  }
  return lines;
}

// ---- Seeding the directory (decision 84) ---------------------------------------------------------

export const SPOT_IMPORT_FORMATS = ['csv', 'geojson'] as const;
export type SpotImportFormat = (typeof SPOT_IMPORT_FORMATS)[number];
/** The largest file the import takes (the API's limit). */
export const SPOT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** The most rows a file can hold (the API's limit). */
export const SPOT_IMPORT_MAX_ROWS = 500;

/** What an import answers: `items` were created, or would be on a dry run. */
export type SpotImportResult = {
  created: number;
  skipped: { row: number; reason: string }[];
  items: {
    row: number;
    name: string;
    city: string;
    countryCode: string;
    /** Spots only: testing centres (phase 5) have no type. */
    type?: CruisingSpotType;
  }[];
};

/** The import form's state: the last check's or import's answer, or why it failed. */
export type SpotImportState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** The answer was a dry run ("Check"): nothing was created yet. */
  dryRun?: boolean;
  result?: SpotImportResult;
};

/**
 * The format of an import: the one chosen, else the file's extension (`.csv`; `.geojson` or
 * `.json`). Null when neither says.
 */
export function spotImportFormat(
  fileName: string,
  chosen: string | null | undefined,
): SpotImportFormat | null {
  const picked = SPOT_IMPORT_FORMATS.find((format) => format === chosen);
  if (picked) return picked;
  const extension = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  if (extension === 'csv') return 'csv';
  if (extension === 'geojson' || extension === 'json') return 'geojson';
  return null;
}
