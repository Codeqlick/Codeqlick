/**
 * What the three 18+ apps share (architecture 4.16, phase 1): the app names, the report and
 * suspension categories, and the small rules the shared safety screens follow. Plain helpers, no
 * server code, so they are unit-tested.
 */

export const ADULT_APPS = ['CRUISING', 'SWIPE', 'VIDEOCHAT'] as const;
export type AdultApp = (typeof ADULT_APPS)[number];

/** The apps' names are proper names: never translated. */
export const ADULT_APP_NAMES: Record<AdultApp, string> = {
  CRUISING: 'Cruising',
  SWIPE: 'Swipe',
  VIDEOCHAT: 'Videochat',
};

/** MINOR, NON_CONSENSUAL and ILLEGAL suspensions apply in the three apps (decision 114). */
export const SERIOUS_CATEGORIES = ['MINOR', 'NON_CONSENSUAL', 'ILLEGAL'] as const;
export type SeriousCategory = (typeof SERIOUS_CATEGORIES)[number];

export const OTHER_CATEGORIES = [
  'HARASSMENT',
  'HATE',
  'SPAM',
  'STOLEN',
  'DANGER',
  'WRONG_INFO',
  'OTHER',
] as const;

export const ALL_CATEGORIES = [...SERIOUS_CATEGORIES, ...OTHER_CATEGORIES] as const;
export type AdultCategory = (typeof ALL_CATEGORIES)[number];

export const SHARED_SUSPENSION_DURATIONS = ['24h', '7d', '30d', 'permanent'] as const;
export type SharedSuspensionDuration = (typeof SHARED_SUSPENSION_DURATIONS)[number];

export function isSeriousCategory(value: string | null | undefined): value is SeriousCategory {
  return (SERIOUS_CATEGORIES as readonly string[]).includes(value ?? '');
}

export function parseCategory(value: FormDataEntryValue | null): AdultCategory | null {
  return ALL_CATEGORIES.find((category) => category === value) ?? null;
}

export function parseSeriousCategory(value: FormDataEntryValue | null): SeriousCategory | null {
  return SERIOUS_CATEGORIES.find((category) => category === value) ?? null;
}

export function parseAdultApp(value: FormDataEntryValue | null): AdultApp | null {
  return ADULT_APPS.find((app) => app === value) ?? null;
}

export function parseSharedDuration(
  value: FormDataEntryValue | null,
): SharedSuspensionDuration | null {
  return SHARED_SUSPENSION_DURATIONS.find((duration) => duration === value) ?? null;
}

export type CategoryOption = { value: AdultCategory; label: string };

/**
 * The options of a category select: serious ones carry the suffix saying they apply in the three
 * apps; `only` limits it to the serious ones (the shared suspension form).
 */
export function categoryOptions(
  label: (category: AdultCategory) => string,
  seriousSuffix: string,
  only: 'all' | 'serious' = 'all',
): CategoryOption[] {
  const categories: readonly AdultCategory[] =
    only === 'serious' ? SERIOUS_CATEGORIES : ALL_CATEGORIES;
  return categories.map((value) => ({
    value,
    label: isSeriousCategory(value) ? `${label(value)} (${seriousSuffix})` : label(value),
  }));
}

export type BlockedMember = {
  ref: string;
  name: string | null;
  sourceApp: AdultApp | null;
  createdAt: string;
};

/**
 * How a block's person is named: their name in the app asked from, or "A member of another 18+
 * app" when they have none there. Never another app's name.
 */
export function blockLabel(block: Pick<BlockedMember, 'name'>, otherApp: string): string {
  const name = block.name?.trim();
  return name ? name : otherApp;
}

/** The app where a block was made, or null on older rows. */
export function blockApp(block: Pick<BlockedMember, 'sourceApp'>): string | null {
  return block.sourceApp ? ADULT_APP_NAMES[block.sourceApp] : null;
}

/** "Swipe · Cruising" for the apps a person was also reported in. */
export function appNames(apps: readonly AdultApp[]): string {
  return apps.map((app) => ADULT_APP_NAMES[app]).join(' · ');
}

export type AlsoReportedData = { apps: AdultApp[]; open: number } | null | undefined;

/** Nothing to show unless the person was reported in another app. */
export function hasAlsoReported(
  data: AlsoReportedData,
): data is { apps: AdultApp[]; open: number } {
  return !!data && data.apps.length > 0;
}
