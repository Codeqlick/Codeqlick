import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';
import { WEEKDAYS } from './booking-time.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const interval = z
  .object({ start: time, end: time })
  .strict()
  .refine((value) => value.end > value.start, { message: 'The end must be after the start' });

/**
 * The booking page's settings: the video-call link, how long calls last, how much notice and how
 * far ahead, and the weekly free hours (Madrid time). Nothing is public until `enabled`.
 */
export const bookingConfigSchema = z
  .object({
    enabled: z.boolean(),
    meetingUrl: z.url().max(500).or(z.literal('')),
    /** Also gets the team's invitation, so calls land in that calendar (e.g. the owner's Gmail). */
    calendarEmail: z.email().max(254).or(z.literal('')).default(''),
    durationMinutes: z.number().int().min(15).max(120),
    minNoticeHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 14),
    horizonDays: z.number().int().min(1).max(90),
    weekly: z
      .object(
        Object.fromEntries(WEEKDAYS.map((day) => [day, z.array(interval).max(4)])) as {
          [K in (typeof WEEKDAYS)[number]]: z.ZodArray<typeof interval>;
        },
      )
      .strict(),
  })
  .strict()
  .refine((config) => !config.enabled || config.meetingUrl !== '', {
    message: 'Set the video-call link before publishing it',
    path: ['meetingUrl'],
  })
  .refine((config) => !config.enabled || WEEKDAYS.some((day) => config.weekly[day].length > 0), {
    message: 'Add some free hours before publishing it',
    path: ['weekly'],
  });
export type BookingConfig = z.infer<typeof bookingConfigSchema>;

export const DEFAULT_BOOKING: BookingConfig = {
  enabled: false,
  meetingUrl: '',
  calendarEmail: '',
  durationMinutes: 30,
  minNoticeHours: 24,
  horizonDays: 21,
  weekly: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
};

export const createBookingSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    company: z.string().trim().max(160).optional(),
    message: z.string().trim().max(2000).optional(),
    locale: localeSchema,
    /** One of the free slots (ISO instant). */
    startsAt: z.iso.datetime({ offset: true }),
    /** Honeypot: humans never see this field, bots fill it in. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({ token: z.string().min(10).max(200) }).strict();
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const listBookingsQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
