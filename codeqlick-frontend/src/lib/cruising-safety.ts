/**
 * Cruising's safety and health (architecture 4.15, phase 5): the "Check on me" timer and its
 * trusted contacts (decision 95), sexual health and the testing centres (decision 94). Shapes
 * mirror the API's; the helpers are pure (server and browser).
 */

export type TrustedContactStatus = 'PENDING' | 'ACCEPTED' | 'REFUSED';

export type TrustedContact = {
  id: string;
  /** Masked by the API: `f***@example.com`. */
  email: string;
  displayName: string;
  status: TrustedContactStatus;
  createdAt: string;
};

export type CruisingTimer = {
  id: string;
  endsAt: string;
  startedAt: string;
  message: string | null;
  shareSpot: boolean;
  spot: { id: string; slug: string; name: string } | null;
  warned: boolean;
};

export const PREP_STATUSES = ['ON_PREP', 'NOT_ON_PREP'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];
export const REMINDER_MONTHS = [3, 6] as const;

export type CruisingHealth = {
  enabled: boolean;
  prepStatus: PrepStatus | null;
  lastTestedMonth: string | null;
  visible: boolean;
  reminderMonths: number | null;
};

/** What another member shows of their sexual health (only when they chose to). */
export type MemberHealth = { prepStatus: PrepStatus | null; lastTestedMonth: string | null };

export type HealthCenter = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  countryCode: string;
  city: string;
  citySlug: string;
  url: string | null;
  phone: string | null;
  free: boolean;
  anonymous: boolean;
  rapid: boolean;
};

export type HealthCenterPlaces = {
  countries: {
    countryCode: string;
    count: number;
    cities: { city: string; citySlug: string; count: number }[];
  }[];
};

export const MAX_TRUSTED_CONTACTS = 2;
export const LIMITS = { displayName: 40, timerMessage: 200 } as const;
/** The timer's lengths a member picks from (30 minutes to 6 hours). */
export const TIMER_MINUTES = [30, 60, 90, 120, 180, 240, 360] as const;
/** What "Extend" adds. */
export const EXTEND_MINUTES = [15, 30, 60] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type ContactFormErrors = Partial<Record<'email' | 'displayName', 'invalid' | 'required'>>;

/** A trusted contact's form: an email and the name the member gives themselves (≤ 40). */
export function parseContactForm(formData: FormData): {
  values: { email: string; displayName: string };
  errors: ContactFormErrors;
} {
  const email = String(formData.get('email') ?? '').trim();
  const displayName = String(formData.get('displayName') ?? '').trim();
  const errors: ContactFormErrors = {};
  if (!email) errors.email = 'required';
  else if (!EMAIL.test(email) || email.length > 254) errors.email = 'invalid';
  if (!displayName) errors.displayName = 'required';
  else if (displayName.length > LIMITS.displayName) errors.displayName = 'invalid';
  return { values: { email, displayName }, errors };
}

/** The timer's form: a length from the list, an optional message, and the spot only if shared. */
export function parseTimerForm(formData: FormData):
  | {
      ok: true;
      input: { minutes: number; message: string | null; shareSpot: boolean; spotId?: string };
    }
  | { ok: false; error: 'minutes' | 'message' | 'spot' } {
  const minutes = Number(formData.get('minutes'));
  if (!TIMER_MINUTES.some((value) => value === minutes)) return { ok: false, error: 'minutes' };
  const message = String(formData.get('message') ?? '').trim();
  if (message.length > LIMITS.timerMessage) return { ok: false, error: 'message' };
  const shareSpot = formData.get('shareSpot') === 'on';
  const spotId = String(formData.get('spotId') ?? '');
  if (shareSpot && !UUID.test(spotId)) return { ok: false, error: 'spot' };
  return {
    ok: true,
    input: { minutes, message: message || null, shareSpot, ...(shareSpot ? { spotId } : {}) },
  };
}

/** A `YYYY-MM` from 2000 to the current month: a test can't be in the future. */
export function isValidTestMonth(value: string, now: Date = new Date()): boolean {
  const match = MONTH.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  if (year < 2000) return false;
  const month = year * 12 + Number(match[2]) - 1;
  return month <= now.getUTCFullYear() * 12 + now.getUTCMonth();
}

/** The current month as `YYYY-MM` (the month field's `max`). */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type HealthFormResult =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; error: 'consent' | 'month' | 'prep' | 'reminder' };

/**
 * The health form: off (`enabled` unticked) deletes everything; on needs the consent box the
 * first time, a past month and the choices from the lists.
 */
export function parseHealthForm(
  formData: FormData,
  alreadyOn: boolean,
  now: Date = new Date(),
): HealthFormResult {
  if (formData.get('enabled') !== 'on') return { ok: true, input: { enabled: false } };
  const consent = formData.get('consent') === 'on';
  if (!alreadyOn && !consent) return { ok: false, error: 'consent' };
  const prep = String(formData.get('prepStatus') ?? '');
  if (prep && !PREP_STATUSES.some((value) => value === prep)) return { ok: false, error: 'prep' };
  const month = String(formData.get('lastTestedMonth') ?? '').trim();
  if (month && !isValidTestMonth(month, now)) return { ok: false, error: 'month' };
  const reminder = String(formData.get('reminderMonths') ?? '');
  const reminderMonths = reminder ? Number(reminder) : null;
  if (reminderMonths !== null && !REMINDER_MONTHS.some((value) => value === reminderMonths)) {
    return { ok: false, error: 'reminder' };
  }
  return {
    ok: true,
    input: {
      enabled: true,
      ...(consent ? { consent: true } : {}),
      prepStatus: prep || null,
      lastTestedMonth: month || null,
      visible: formData.get('visible') === 'on',
      reminderMonths: month ? reminderMonths : null,
    },
  };
}

/** The time left on a timer, in whole minutes rounded up (0 once it ran out). */
export function minutesLeft(endsAt: string, now: number = Date.now()): number {
  const left = Date.parse(endsAt) - now;
  return left <= 0 ? 0 : Math.ceil(left / 60_000);
}

/** `h:mm` of a number of minutes (`1:05`), for the countdown. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Whether a link of the contact page stops the alerts (from an alert) or answers an invitation. */
export function contactLinkKind(token: string): 'stop' | 'invite' | null {
  const value = token.trim();
  if (!value || value.length > 200) return null;
  return value.startsWith('stop.') ? 'stop' : 'invite';
}

/** "October 2026": a `YYYY-MM` as the profile shows it. */
export function formatMonth(month: string, locale: string): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

/** Centres grouped by country, then city, in the order of `places` (most first). */
export function groupCenters(
  centers: readonly HealthCenter[],
  places: HealthCenterPlaces,
): { countryCode: string; cities: { city: string; citySlug: string; items: HealthCenter[] }[] }[] {
  return places.countries.map((country) => ({
    countryCode: country.countryCode,
    cities: country.cities.map((city) => ({
      city: city.city,
      citySlug: city.citySlug,
      items: centers
        .filter(
          (center) =>
            center.countryCode === country.countryCode && center.citySlug === city.citySlug,
        )
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    })),
  }));
}

export type CenterErrorKey = 'name' | 'address' | 'lat' | 'lng' | 'countryCode' | 'city' | 'url';

/** The admin's testing-centre form (decision 94): what the API takes, or the fields that are wrong. */
export function parseCenterForm(
  formData: FormData,
  countries: readonly string[],
): {
  values: Record<string, string>;
  errors: CenterErrorKey[];
  data: Omit<HealthCenter, 'id' | 'citySlug'> | null;
} {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  const values = {
    name: text('name'),
    address: text('address'),
    lat: text('lat'),
    lng: text('lng'),
    countryCode: text('countryCode'),
    city: text('city'),
    url: text('url'),
    phone: text('phone'),
  };
  const errors: CenterErrorKey[] = [];
  const coordinate = (value: string, limit: number) => {
    const normalized = value.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Math.abs(number) <= limit ? Math.round(number * 1e5) / 1e5 : null;
  };
  const lat = coordinate(values.lat, 90);
  const lng = coordinate(values.lng, 180);
  if (values.name.length < 2 || values.name.length > 120) errors.push('name');
  if (values.address.length < 3 || values.address.length > 200) errors.push('address');
  if (lat === null) errors.push('lat');
  if (lng === null) errors.push('lng');
  if (!countries.includes(values.countryCode)) errors.push('countryCode');
  if (!values.city || values.city.length > 80) errors.push('city');
  if (values.url && (!/^https?:\/\/\S+$/i.test(values.url) || values.url.length > 300)) {
    errors.push('url');
  }
  if (errors.length > 0 || lat === null || lng === null) return { values, errors, data: null };
  return {
    values,
    errors,
    data: {
      name: values.name,
      address: values.address,
      lat,
      lng,
      countryCode: values.countryCode,
      city: values.city,
      url: values.url || null,
      phone: values.phone.slice(0, 40) || null,
      free: formData.get('free') === 'on',
      anonymous: formData.get('anonymous') === 'on',
      rapid: formData.get('rapid') === 'on',
    },
  };
}

/** The anchor of a country's or city's list on the /health page. */
export function healthAnchor(countryCode: string, citySlug?: string): string {
  return citySlug ? `${countryCode.toLowerCase()}-${citySlug}` : countryCode.toLowerCase();
}
