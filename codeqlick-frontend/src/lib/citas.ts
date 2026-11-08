/** Citas helpers shared by the server and the browser (architecture 4.9). No Zod, no server-only. */

/** Time zones offered when creating a page: Spain first, then Latin America and a few others. */
export const CITAS_TIME_ZONES = [
  'Europe/Madrid',
  'Atlantic/Canary',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Caracas',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Montevideo',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;

export const CITAS_DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const;

/** Words of the app's own routes, which a page's link can't take (same list as the API). */
const RESERVED = ['editar', 'cancelar', 'nueva', 'nuevo', 'new', 'edit', 'cancel'];

/** "Corte de pelo · Ana" → "corte-de-pelo-ana": a link suggestion from a title. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/** Whether the API will take this link (3–40 lowercase letters, digits, single dashes). */
export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 40 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    !RESERVED.includes(slug)
  );
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');
}

/** Free start times grouped by day in the page's time zone, in order. */
export function slotsByDay(
  slots: string[],
  timeZone: string,
): Array<[day: string, slots: string[]]> {
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone });
  const days = new Map<string, string[]>();
  for (const slot of slots) {
    const key = dayKey.format(new Date(slot));
    days.set(key, [...(days.get(key) ?? []), slot]);
  }
  return [...days.entries()];
}
