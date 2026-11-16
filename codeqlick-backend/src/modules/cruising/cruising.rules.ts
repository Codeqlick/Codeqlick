/** Pure rules of Cruising (architecture 4.15): slugs, coordinates, the map's box, ratings, statuses. */
import { RESERVED_USERNAMES } from '../auth/auth.schemas.js';
import { importedTags } from './cruising-insights.rules.js';

/** Lower-case ASCII words joined by hyphens: "Playa del Inglés" becomes "playa-del-ingles". */
export function slugify(value: string, max = 60): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** The start of a spot's slug. */
export function spotSlugBase(name: string): string {
  return slugify(name) || 'spot';
}

/** The slug of a city, for the place pages. */
export function citySlugOf(city: string): string {
  return slugify(city, 80) || 'other';
}

/** `base`, then `base-2`, `base-3`… the first that `isTaken` says is free. */
export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
  maxTries = 50,
): Promise<string> {
  for (let n = 1; n <= maxTries; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Absurdly popular name: a random tail always ends it.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Coordinates are stored with 5 decimals (about a metre). */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5 + 0;
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * `minLng,minLat,maxLng,maxLat`: all numbers, longitudes within -180..180, latitudes within
 * -90..90, min below max. A box crossing the antimeridian is asked for as two; null when invalid.
 */
export function parseBbox(value: string): Bbox | null {
  const parts = value.split(',');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  if (!numbers.every((number) => Number.isFinite(number))) return null;
  const [minLng, minLat, maxLng, maxLat] = numbers as [number, number, number, number];
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

/** What a search's text becomes in a `LIKE`: `%`, `_` and `\\` typed are literal characters. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The `ILIKE` patterns of a search (decision 86): `contains` finds the text anywhere, `prefix` only
 * at the start (those come first). Spaces inside are collapsed to one.
 */
export function searchPatterns(text: string): { contains: string; prefix: string } {
  const words = escapeLike(text.trim().replace(/\s+/g, ' '));
  return { contains: `%${words}%`, prefix: `${words}%` };
}

/** The box around a city's spots, as the map takes it: `[minLng, minLat, maxLng, maxLat]`. */
export function placeBbox(row: {
  minLng: unknown;
  minLat: unknown;
  maxLng: unknown;
  maxLat: unknown;
}): [number, number, number, number] {
  return [Number(row.minLng), Number(row.minLat), Number(row.maxLng), Number(row.maxLat)];
}

export interface PlaceCountry {
  countryCode: string;
  count: number;
  cities: { city: string; citySlug: string; count: number }[];
}

/**
 * Countries with their cities from per-spelling counts, most first (the spots' places and, from
 * phase 5, the testing centres'). A city is named as most of its rows spell it.
 */
export function groupPlaces(
  rows: readonly { countryCode: string; citySlug: string; city: string; count: number }[],
): PlaceCountry[] {
  const countries = new Map<
    string,
    { count: number; cities: Map<string, { names: Map<string, number>; count: number }> }
  >();
  for (const row of rows) {
    const country = countries.get(row.countryCode) ?? { count: 0, cities: new Map() };
    country.count += row.count;
    const city = country.cities.get(row.citySlug) ?? { names: new Map(), count: 0 };
    city.count += row.count;
    city.names.set(row.city, (city.names.get(row.city) ?? 0) + row.count);
    country.cities.set(row.citySlug, city);
    countries.set(row.countryCode, country);
  }
  return [...countries.entries()]
    .map(([countryCode, country]) => ({
      countryCode,
      count: country.count,
      cities: [...country.cities.entries()]
        .map(([citySlug, city]) => ({
          city: [...city.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? citySlug,
          citySlug,
          count: city.count,
        }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)),
    }))
    .sort((a, b) => b.count - a.count || a.countryCode.localeCompare(b.countryCode));
}

/** The average rating with 2 decimals. */
export function roundRating(average: number | null | undefined): number {
  return average ? Math.round(average * 100) / 100 : 0;
}

/** Average (2 decimals) and count of a list of ratings. */
export function summarizeRatings(ratings: readonly number[]): { avg: number; count: number } {
  if (ratings.length === 0) return { avg: 0, count: 0 };
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  return { avg: roundRating(sum / ratings.length), count: ratings.length };
}

export type SpotStatusValue = 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN' | 'REMOVED';
export type SpotAction = 'approve' | 'hide' | 'reject' | 'remove';

/**
 * Where the team can take a spot: publish (approve) any spot that is not live, hide a live one,
 * reject one in review or published (not a removed one), and remove any not removed yet (after a
 * report or a removal request: final for the proposer). Null: not allowed from there.
 */
export function nextSpotStatus(from: SpotStatusValue, action: SpotAction): SpotStatusValue | null {
  if (action === 'approve') return from === 'LIVE' ? null : 'LIVE';
  if (action === 'hide') return from === 'LIVE' ? 'HIDDEN' : null;
  if (action === 'remove') return from === 'REMOVED' ? null : 'REMOVED';
  return from === 'REJECTED' || from === 'REMOVED' ? null : 'REJECTED';
}

/** Reasons that hide a spot at once when they come from the anonymous removal form. */
export function takedownHidesAtOnce(reason: string): boolean {
  return reason === 'MINOR' || reason === 'ILLEGAL';
}

/** The proposer can change or delete a spot only while it is pending or rejected (never removed). */
export function memberCanChange(status: SpotStatusValue): boolean {
  return status === 'PENDING' || status === 'REJECTED';
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The slug in what a person gives: a link ending in `/spots/<slug>`, or the slug itself. */
export function extractSpotSlug(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (SLUG.test(text)) return text;
  const path = text.replace(/[?#].*$/, '');
  const segments = path.split('/').filter(Boolean);
  const at = segments.lastIndexOf('spots');
  const slug = at >= 0 ? segments[at + 1] : undefined;
  return slug && SLUG.test(slug) ? slug : null;
}

/** Suspended right now: a timed suspension that ended no longer counts. */
export function isSuspended(
  profile: { suspendedAt: Date | null; suspendedUntil: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile?.suspendedAt) return false;
  return !profile.suspendedUntil || profile.suspendedUntil > now;
}

/** Words only Cruising reserves, besides the platform's reserved usernames. */
const RESERVED_NICKNAMES = new Set([
  'member',
  'members',
  'miembro',
  'miembros',
  'nickname',
  'apodo',
  'deleted',
  'eliminado',
  'unknown',
  'desconocido',
]);

/** Nicknames nobody can take: the team's, the platform's and the generic words of the app. */
export function isReservedNickname(nickname: string): boolean {
  const word = nickname.toLowerCase().replace(/[._]/g, '');
  return RESERVED_USERNAMES.has(word) || RESERVED_NICKNAMES.has(word);
}

/** The age shown on a profile: the current year minus the year of birth. */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getUTCFullYear() - birthYear;
}

/** When a check-in of `hours` made at `now` ends. */
export function checkInEnd(hours: number, now: Date): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** The two people of a conversation in storage order (`userAId` < `userBId`). */
export function conversationPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

export type TranscriptLine = { from: 'reporter' | 'reported'; text: string; at: string };

/** A conversation's messages as a report keeps them, seen from the reporter. */
export function toTranscript(
  messages: readonly { senderId: string; text: string; createdAt: Date }[],
  reporterId: string,
): TranscriptLine[] {
  return messages.map((message) => ({
    from: message.senderId === reporterId ? 'reporter' : 'reported',
    text: message.text,
    at: message.createdAt.toISOString(),
  }));
}

/**
 * Whether a message must be refused for sharing contact details: only until each of the two has
 * sent `needed` messages (scammers and spammers go straight for them).
 */
export function contactStillBlocked(
  sentByMe: number,
  sentByPartner: number,
  needed: number,
): boolean {
  return sentByMe < needed || sentByPartner < needed;
}

/** A write refused because the value is taken (Prisma's P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

// ---- Favourites and alerts (phase 3, decision 85) ----------------------------------------------

/** Favourites a member can save. */
export const MAX_FAVORITES = 100;
/** A member hears about the same favourite spot at most once in this time… */
export const ALERT_SPOT_GAP_MS = 3 * 60 * 60 * 1000;
/** …at most this many times a day in all… */
export const ALERTS_PER_DAY = 10;
/** …and gets at most one email about favourites a day. */
export const ALERT_DAY_MS = 24 * 60 * 60 * 1000;
/** Alerts are kept this long (the caps only look one day back). */
export const ALERT_KEEP_MS = 2 * ALERT_DAY_MS;
/** Devices with notifications on, per member: a new one drops the oldest. */
export const MAX_PUSH_SUBSCRIPTIONS = 5;

export type AlertChannel = 'PUSH' | 'EMAIL';

/** What decides how (and whether) a member who saved a spot hears that someone checked in. */
export interface AlertCandidate {
  /** Push for favourites (default on). */
  favoriteAlerts: boolean;
  /** The daily email about favourites (default off). */
  favoriteEmails: boolean;
  /** Cruising's email switch: off turns every optional email off. */
  emailAlerts: boolean;
  /** Push works (VAPID keys set) and the member has a device subscribed. */
  hasPush: boolean;
}

/** One of the member's recent alerts: the spot, the channel and when. */
export type RecentAlert = { spotId: string; channel: AlertChannel; createdAt: Date };

/**
 * Whether the caps let a member hear about `spotId` now (decision 85): never twice for the same
 * spot within 3 hours, never more than 10 a day. The notification centre (decision 98) follows
 * them too, whatever the channel.
 */
export function alertAllowed(spotId: string, recent: readonly RecentAlert[], now: Date): boolean {
  const dayAgo = now.getTime() - ALERT_DAY_MS;
  const today = recent.filter((alert) => alert.createdAt.getTime() > dayAgo);
  if (today.length >= ALERTS_PER_DAY) return false;
  const spotGap = now.getTime() - ALERT_SPOT_GAP_MS;
  return !today.some((alert) => alert.spotId === spotId && alert.createdAt.getTime() > spotGap);
}

/**
 * How a member is alerted that someone is at `spotId` (decision 85), or null: never twice for the
 * same spot within 3 hours, never more than 10 a day; by push when they have a device subscribed
 * (and favourite alerts on), else by email when they asked for it, at most one email a day.
 */
export function alertChannel(
  candidate: AlertCandidate,
  spotId: string,
  recent: readonly RecentAlert[],
  now: Date,
): AlertChannel | null {
  if (!alertAllowed(spotId, recent, now)) return null;
  const dayAgo = now.getTime() - ALERT_DAY_MS;
  const today = recent.filter((alert) => alert.createdAt.getTime() > dayAgo);
  if (candidate.hasPush) return candidate.favoriteAlerts ? 'PUSH' : null;
  if (!candidate.favoriteEmails || !candidate.emailAlerts) return null;
  return today.some((alert) => alert.channel === 'EMAIL') ? null : 'EMAIL';
}

/**
 * What a notification is about: someone at a favourite spot, a new message, and in phase 5 a
 * meetup planned or a safety alert at a favourite spot, or a meetup the member joined cancelled;
 * in phase 6 a private album shared with the member (decision 99).
 */
export type PushKind =
  'favorite' | 'message' | 'meetup' | 'safety' | 'meetup-cancelled' | 'album' | 'wink';

/** The kinds that tell the members who saved a spot (decision 85's channels and caps). */
export type FavoriteAlertKind = 'favorite' | 'meetup' | 'safety';

const PUSH_TEXT: Record<'en' | 'es', Record<PushKind, string>> = {
  en: {
    favorite: 'Someone is at one of your favourite spots',
    message: 'New message',
    meetup: 'A meetup was planned at one of your favourite spots',
    safety: 'Safety alert at one of your favourite spots',
    'meetup-cancelled': 'A meetup you joined was cancelled',
    album: 'Someone shared their private album with you',
    wink: 'Someone winked at you',
  },
  es: {
    favorite: 'Hay alguien en uno de tus lugares favoritos',
    message: 'Mensaje nuevo',
    meetup: 'Se ha organizado una quedada en uno de tus lugares favoritos',
    safety: 'Alerta de seguridad en uno de tus lugares favoritos',
    'meetup-cancelled': 'Se ha cancelado una quedada a la que ibas',
    album: 'Alguien ha compartido contigo su álbum privado',
    wink: 'Alguien te ha guiñado un ojo',
  },
};

const PUSH_PATH: Record<PushKind, string> = {
  favorite: '/favorites',
  message: '/messages',
  meetup: '/meetups',
  safety: '/favorites',
  'meetup-cancelled': '/meetups',
  album: '/messages',
  wink: '/notifications?view=winks',
};

/**
 * A notification's payload: it names neither the spot nor a person, and opens the favourites, the
 * messages or the meetups in the account's language.
 */
export function pushPayload(
  kind: PushKind,
  locale: 'en' | 'es',
): { title: string; body: string; url: string; tag: string } {
  return {
    title: 'Cruising',
    body: PUSH_TEXT[locale][kind],
    url: `/${locale}${PUSH_PATH[kind]}`,
    tag: `cruising-${kind}`,
  };
}

// ---- Seeding the directory (decision 84) ---------------------------------------------------------

/** Lower-case, no accents, single spaces: how type labels are compared. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

/** The website's English and Spanish labels of each type (`Cruising.types` in its messages). */
const TYPE_LABELS: Record<string, readonly string[]> = {
  BEACH: ['Beach', 'Playa'],
  PARK: ['Park', 'Parque'],
  FOREST: ['Forest or woods', 'Bosque o monte'],
  REST_AREA: ['Rest area', 'Área de descanso'],
  SAUNA: ['Sauna'],
  BAR_CLUB: ['Bar or club', 'Bar o discoteca'],
  CINEMA: ['Cinema', 'Cine'],
  OTHER: ['Other', 'Otro'],
};

const TYPE_BY_LABEL = new Map<string, string>(
  Object.entries(TYPE_LABELS).flatMap(([type, labels]) =>
    [type, ...labels].map((label): [string, string] => [fold(label), type]),
  ),
);

/** The type a file names: the enum or its English or Spanish label, any case. Null: unknown. */
export function spotTypeFromLabel(value: string): string | null {
  return TYPE_BY_LABEL.get(fold(value)) ?? null;
}

/** A spot's fields as a file gives them, before they are checked like a proposal. */
export interface ImportedFields {
  name: unknown;
  type: unknown;
  lat: unknown;
  lng: unknown;
  countryCode: unknown;
  city: unknown;
  description: unknown;
  bestTimes: unknown;
  /** Phase 5 (decision 92). */
  tags: unknown;
  openingHours: unknown;
  tips: unknown;
}

/** One row of an import: its line (CSV, header = 1) or index (GeoJSON) and its fields. */
export interface ImportedRowOf<F> {
  row: number;
  /** Null when the row can't even be read (a GeoJSON feature that isn't a point): see `error`. */
  fields: F | null;
  error?: string;
}

export type ImportParseOf<F> =
  { ok: true; rows: ImportedRowOf<F>[] } | { ok: false; error: string };

export type ImportedRow = ImportedRowOf<ImportedFields>;
export type ImportParse = ImportParseOf<ImportedFields>;

/**
 * What a kind of import reads (decision 84; phase 5 adds the testing centres): its columns (two of
 * them `lat` and `lng`, from the geometry in GeoJSON), the ones a CSV header must name, and how a
 * row's values become fields, alike for CSV and GeoJSON.
 */
export interface ImportSpec<C extends string, F> {
  columns: readonly C[];
  required: readonly C[];
  fields: (get: (column: C | 'lat' | 'lng') => unknown) => F;
}

/** A header cell or property name as a column: any case; spaces, hyphens and underscores ignored. */
function columnOf<C extends string>(columns: readonly C[], name: string): C | null {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  return columns.find((column) => column.toLowerCase() === key) ?? null;
}

/** The separator of a CSV: comma or semicolon, whichever its first line has more of outside quotes. */
function csvSeparator(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

/**
 * Splits CSV text into records (RFC 4180: quoted fields may hold separators, `""` and line
 * breaks), each with the line it starts on. Blank lines are left out; a leading BOM is ignored.
 * Null when a quote is never closed.
 */
export function splitCsv(text: string): { line: number; cells: string[] }[] | null {
  const source = text.replace(/^﻿/, '');
  const separator = csvSeparator(source);
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRecord = () => {
    cells.push(cell);
    if (cells.length > 1 || cells[0]!.trim() !== '') records.push({ line: start, cells });
    cells = [];
    cell = '';
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      cells.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      start = line;
    } else {
      cell += char;
    }
  }
  if (quoted) return null;
  if (cell !== '' || cells.length > 0) endRecord();
  return records;
}

/** A coordinate as a CSV writes it: a dot or, as Spanish spreadsheets do, a comma for decimals. */
function csvNumber(value: string): number {
  const text = value.trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
  return text === '' ? Number.NaN : Number(text);
}

/** A cell's text trimmed; anything else (GeoJSON numbers, booleans) as it is. */
function trimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** An optional text: empty or missing becomes null. */
function optionalText(value: unknown): unknown {
  const text = trimmed(value);
  return text === '' || text === undefined ? null : text;
}

/** An ISO country code in upper case. */
function countryOf(value: unknown): unknown {
  const text = trimmed(value);
  return typeof text === 'string' ? text.toUpperCase() : text;
}

/**
 * The rows of a CSV import: a header row naming the columns in any order (the optional ones may be
 * left out), comma or semicolon separated, UTF-8 with or without BOM. Rows are numbered by line
 * (header = 1).
 */
export function parseImportCsv<C extends string, F>(
  text: string,
  spec: ImportSpec<C, F>,
): ImportParseOf<F> {
  const records = splitCsv(text);
  if (!records) return { ok: false, error: 'A quoted field is never closed' };
  const [header, ...data] = records;
  if (!header) return { ok: false, error: 'The file is empty' };
  const columns = header.cells.map((cell) => columnOf(spec.columns, cell));
  const missing = spec.required.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return { ok: false, error: `The header row lacks the columns ${missing.join(', ')}` };
  }
  const rows = data.map(({ line, cells }): ImportedRowOf<F> => {
    const cellOf = (column: string) => {
      const at = columns.indexOf(column as C);
      return at < 0 ? undefined : (cells[at] ?? '');
    };
    const fields = spec.fields((column) =>
      column === 'lat' || column === 'lng' ? csvNumber(cellOf(column) ?? '') : cellOf(column),
    );
    return { row: line, fields };
  });
  return { ok: true, rows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The rows of a GeoJSON import: a `FeatureCollection` of `Point` features whose `properties` carry
 * the fields (coordinates from the geometry, `[lng, lat]`). Rows are numbered by their index in
 * `features` (from 0); a feature that isn't a point is a row with an error.
 */
export function parseImportGeojson<C extends string, F>(
  text: string,
  spec: ImportSpec<C, F>,
): ImportParseOf<F> {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'The file is not valid JSON' };
  }
  if (!isRecord(data) || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return { ok: false, error: 'The file is not a GeoJSON FeatureCollection' };
  }
  const rows = (data.features as unknown[]).map((feature, row): ImportedRowOf<F> => {
    const geometry = isRecord(feature) ? feature.geometry : undefined;
    const coordinates = isRecord(geometry) ? geometry.coordinates : undefined;
    if (
      !isRecord(feature) ||
      !isRecord(geometry) ||
      geometry.type !== 'Point' ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      return { row, fields: null, error: 'Not a Point feature' };
    }
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const [lng, lat] = coordinates as unknown[];
    const fields = spec.fields((column) => {
      if (column === 'lat') return lat;
      if (column === 'lng') return lng;
      const key = Object.keys(properties).find((name) => columnOf(spec.columns, name) === column);
      return key === undefined ? undefined : properties[key];
    });
    return { row, fields };
  });
  return { ok: true, rows };
}

const SPOT_COLUMNS = [
  'name',
  'type',
  'lat',
  'lng',
  'countryCode',
  'city',
  'description',
  'bestTimes',
  'tags',
  'openingHours',
  'tips',
] as const;
type SpotColumn = (typeof SPOT_COLUMNS)[number];
const OPTIONAL_SPOT_COLUMNS: readonly SpotColumn[] = ['bestTimes', 'tags', 'openingHours', 'tips'];

/**
 * The spots' import: type labels, upper-case country; `bestTimes`, `tags` (`|`-separated, the enum
 * or a label), `openingHours` and `tips` optional.
 */
const SPOT_IMPORT: ImportSpec<SpotColumn, ImportedFields> = {
  columns: SPOT_COLUMNS,
  required: SPOT_COLUMNS.filter((column) => !OPTIONAL_SPOT_COLUMNS.includes(column)),
  fields: (get) => {
    const type = trimmed(get('type'));
    return {
      name: trimmed(get('name')),
      type: typeof type === 'string' ? (spotTypeFromLabel(type) ?? type) : type,
      lat: get('lat'),
      lng: get('lng'),
      countryCode: countryOf(get('countryCode')),
      city: trimmed(get('city')),
      description: trimmed(get('description')),
      bestTimes: optionalText(get('bestTimes')),
      tags: importedTags(get('tags')),
      openingHours: optionalText(get('openingHours')),
      tips: optionalText(get('tips')),
    };
  },
};

/** The rows of a CSV import of spots (the optional columns may be left out). */
export function parseSpotsCsv(text: string): ImportParse {
  return parseImportCsv(text, SPOT_IMPORT);
}

/** The rows of a GeoJSON import of spots. */
export function parseSpotsGeojson(text: string): ImportParse {
  return parseImportGeojson(text, SPOT_IMPORT);
}

/** A testing centre's fields as a file gives them (phase 5, decision 94). */
export interface ImportedHealthFields {
  name: unknown;
  address: unknown;
  lat: unknown;
  lng: unknown;
  countryCode: unknown;
  city: unknown;
  url: unknown;
  phone: unknown;
  free: unknown;
  anonymous: unknown;
  rapid: unknown;
}

const YES = new Set(['true', 'yes', 'y', 'si', 'sí', 's', '1', 'x']);
const NO = new Set(['false', 'no', 'n', '0', '']);

/** A yes/no cell: true, yes, sí, 1 or x; false, no, 0 or empty; anything else is left to refuse. */
export function importFlag(value: unknown): unknown {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'string') return value;
  const text = value.trim().toLowerCase();
  if (YES.has(text)) return true;
  if (NO.has(text)) return false;
  return text;
}

const HEALTH_COLUMNS = [
  'name',
  'address',
  'lat',
  'lng',
  'countryCode',
  'city',
  'url',
  'phone',
  'free',
  'anonymous',
  'rapid',
] as const;

const HEALTH_IMPORT: ImportSpec<(typeof HEALTH_COLUMNS)[number], ImportedHealthFields> = {
  columns: HEALTH_COLUMNS,
  required: ['name', 'address', 'lat', 'lng', 'countryCode', 'city'],
  fields: (get) => ({
    name: trimmed(get('name')),
    address: trimmed(get('address')),
    lat: get('lat'),
    lng: get('lng'),
    countryCode: countryOf(get('countryCode')),
    city: trimmed(get('city')),
    url: optionalText(get('url')),
    phone: optionalText(get('phone')),
    free: importFlag(get('free')),
    anonymous: importFlag(get('anonymous')),
    rapid: importFlag(get('rapid')),
  }),
};

/** The rows of a CSV import of testing centres (`url`, `phone` and the yes/no columns optional). */
export function parseHealthCentersCsv(text: string): ImportParseOf<ImportedHealthFields> {
  return parseImportCsv(text, HEALTH_IMPORT);
}

/** The rows of a GeoJSON import of testing centres. */
export function parseHealthCentersGeojson(text: string): ImportParseOf<ImportedHealthFields> {
  return parseImportGeojson(text, HEALTH_IMPORT);
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A box holding every point within `meters` of `point` (5 % more, for rounding), for a first cut
 * in the database (then `distanceMeters` decides). Clamped to the poles and the antimeridian: a
 * spot just across the antimeridian is not seen (nobody cruises there).
 */
export function boxAround(point: GeoPoint, meters: number): Bbox {
  const dLat = ((meters * 1.05) / EARTH_RADIUS_M) * (180 / Math.PI);
  const cos = Math.cos(radians(point.lat));
  const dLng = cos < 1e-6 ? 360 : dLat / cos;
  return {
    minLat: Math.max(-90, point.lat - dLat),
    maxLat: Math.min(90, point.lat + dLat),
    minLng: Math.max(-180, point.lng - dLng),
    maxLng: Math.min(180, point.lng + dLng),
  };
}

/** Two spots of the same type this close are the same place (decision 84). */
export const DUPLICATE_METERS = 100;

/** The first of `others` of the same type within `meters` of `spot`, or null. */
export function findDuplicate<T extends GeoPoint & { type: string }>(
  spot: GeoPoint & { type: string },
  others: readonly T[],
  meters = DUPLICATE_METERS,
): T | null {
  return (
    others.find((other) => other.type === spot.type && distanceMeters(spot, other) <= meters) ??
    null
  );
}
