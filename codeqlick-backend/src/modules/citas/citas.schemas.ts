import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';
import { WEBAPPS } from '../../common/webapps.js';
import { isTimeZone, WEEKDAYS, type Interval, type Weekday } from '../bookings/booking-time.js';

/** Booking pages an account can have. */
export const CITAS_MAX_PAGES = 10;
/**
 * Words a page's link (citas.codeqlick.com/es/<slug>) can't take: the app's own routes, the sign-in
 * pages its host also serves, the web apps and the main site's sections.
 */
export const RESERVED_SLUGS: string[] = [
  'editar',
  'cancelar',
  'nueva',
  'nuevo',
  'new',
  'edit',
  'cancel',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  // The main site's sections: the frontend's `SITE_SECTIONS`.
  ...WEBAPPS,
  'about',
  'admin',
  'apps',
  'basic-website',
  'blog',
  'book',
  'calculator',
  'confirm-email',
  'contact',
  'legal',
  'portal',
  'privacy',
  'services',
  'terms',
  'work',
];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const interval = z
  .object({ start: time, end: time })
  .strict()
  .refine((value) => value.end > value.start, { message: 'The end must be after the start' });

/** Free hours per weekday: up to 4 intervals a day that don't overlap. */
export const weeklySchema = z
  .object(
    Object.fromEntries(WEEKDAYS.map((day) => [day, z.array(interval).max(4)])) as {
      [K in Weekday]: z.ZodArray<typeof interval>;
    },
  )
  .strict()
  .refine(
    (weekly) =>
      WEEKDAYS.every((day) => {
        const sorted = weekly[day].toSorted((a, b) => a.start.localeCompare(b.start));
        return sorted.every((item, index) => index === 0 || item.start >= sorted[index - 1]!.end);
      }),
    { message: 'The free hours of a day overlap' },
  );
export type Weekly = Record<Weekday, Interval[]>;

export const EMPTY_WEEKLY: Weekly = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

export const pageSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits and single dashes')
  .refine((slug) => !RESERVED_SLUGS.includes(slug), { message: 'That link is reserved' });

const pageFields = {
  slug: pageSlugSchema,
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  durationMinutes: z.number().int().min(10).max(240),
  location: z.string().trim().max(200),
  /** A video call in Meetings: the page gets its own room, whose link goes in each appointment. */
  video: z.boolean(),
  askPhone: z.boolean(),
  timeZone: z
    .string()
    .max(64)
    .refine((zone) => isTimeZone(zone), { message: 'Unknown time zone' }),
  weekly: weeklySchema,
  minNoticeHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 30),
  horizonDays: z.number().int().min(1).max(180),
  enabled: z.boolean(),
};

export const createPageSchema = z.object(pageFields).strict();
export type CreatePageInput = z.infer<typeof createPageSchema>;

export const updatePageSchema = z.object(pageFields).partial().strict();
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

export const slugParamSchema = z.object({ slug: pageSlugSchema });
export type SlugParam = z.infer<typeof slugParamSchema>;

export const createAppointmentSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
    phone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+\d][\d\s().-]{5,}$/, 'Not a phone number')
      .optional()
      .or(z.literal('')),
    note: z.string().trim().max(500).optional(),
    locale: localeSchema,
    /** One of the free times (ISO instant). */
    startsAt: z.iso.datetime({ offset: true }),
    /** Honeypot: people never see this field, bots fill it in. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const tokenSchema = z.object({ token: z.string().min(20).max(200) }).strict();
export type TokenInput = z.infer<typeof tokenSchema>;

export const appointmentsQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});
export type AppointmentsQuery = z.infer<typeof appointmentsQuerySchema>;

/** The weekly hours as stored, or none when the JSON isn't valid any more. */
export function parseWeekly(value: unknown): Weekly {
  const parsed = weeklySchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_WEEKLY;
}
