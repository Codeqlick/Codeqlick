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
export type CruisingReportReason = (typeof REPORT_REASONS)[number];
/** What a review can be reported for: a wrong detail is about the place, not the person's words. */
export const REVIEW_REPORT_REASONS = REPORT_REASONS.filter((reason) => reason !== 'WRONG_INFO');

/** Why someone asks for a spot to be removed (the public form). */
export const TAKEDOWN_REASONS = ['MINOR', 'ILLEGAL', 'DANGER', 'OTHER'] as const;
export type CruisingTakedownReason = (typeof TAKEDOWN_REASONS)[number];

export const SPOT_STATUSES = ['PENDING', 'LIVE', 'REJECTED', 'HIDDEN'] as const;
export type CruisingSpotStatus = (typeof SPOT_STATUSES)[number];

export const SUSPENSIONS = ['24h', '7d', '30d', 'permanent'] as const;
export type CruisingSuspension = (typeof SUSPENSIONS)[number];

/** Limits of the API (architecture 4.15). */
export const LIMITS = {
  name: 80,
  city: 80,
  description: 1000,
  bestTimes: 200,
  review: 1000,
  details: 1000,
  rejectReason: 500,
} as const;

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
  | 'bestTimesLong';

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
  return { values, errors, data };
}

/** The API body of a proposal, or null when a required field is missing (a partial edit). */
export function toSpotInput(data: Partial<SpotInput>): SpotInput | null {
  const { name, type, lat, lng, countryCode, city, description, bestTimes } = data;
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
