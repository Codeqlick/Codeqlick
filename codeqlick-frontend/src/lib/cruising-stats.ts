import { snapBbox, type Bbox } from './cruising';

/** Cruising phase 6 (architecture 4.15): admin statistics (decision 101) and onboarding (102). */

/** One week (Monday to Sunday, Europe/Madrid). */
export type CruisingStatsWeek = {
  /** The Monday, `yyyy-mm-dd`. */
  start: string;
  members: number;
  active: number;
  spots: { pending: number; live: number; rejected: number };
  checkIns: number;
  meetups: number;
  messages: number;
  roomMessages: number;
  media: number;
  reportsOpened: number;
  reportsDecided: number;
  medianDecisionHours: number | null;
  takedowns: number;
};

export type CruisingCountryStat = { countryCode: string; count: number };
export type CruisingCityStat = CruisingCountryStat & { citySlug: string; city: string };

export type CruisingStats = {
  generatedAt: string;
  weeks: CruisingStatsWeek[];
  topCountries: { spots: CruisingCountryStat[]; checkIns: CruisingCountryStat[] };
  topCities: { spots: CruisingCityStat[]; checkIns: CruisingCityStat[] };
};

/** Each week's short axis label ("16/11") and its full date for the tables ("16 Nov 2026"). */
export function weekLabels(starts: readonly string[], locale: string) {
  const short = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  });
  const long = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return {
    labels: starts.map((start) => short.format(new Date(`${start}T00:00:00Z`))),
    longLabels: starts.map((start) => long.format(new Date(`${start}T00:00:00Z`))),
  };
}

/** Sum of a weekly figure over the weeks. */
export function weeksTotal(
  weeks: readonly CruisingStatsWeek[],
  pick: (week: CruisingStatsWeek) => number,
) {
  return weeks.reduce((sum, week) => sum + pick(week), 0);
}

/** Half the side, in degrees, of the box around the map's view the suggestions look in. */
const SUGGESTIONS_REACH = 0.5;

/**
 * The box to suggest spots in for the map's last view: a square around its centre grown to the
 * 0.25° grid (the API refuses anything else), or null when the map shows the whole world.
 */
export function suggestionsBbox(view: {
  center: readonly [number, number];
  located: boolean;
}): Bbox | null {
  if (!view.located) return null;
  const [lat, lng] = view.center;
  return snapBbox({
    minLng: Math.max(-180, lng - SUGGESTIONS_REACH),
    minLat: Math.max(-90, lat - SUGGESTIONS_REACH),
    maxLng: Math.min(180, lng + SUGGESTIONS_REACH),
    maxLat: Math.min(90, lat + SUGGESTIONS_REACH),
  });
}
