import { z } from 'zod';
import { slugSchema } from '../../common/schemas/common.schemas.js';
import {
  MEETUP_MAX_CAPACITY,
  MEETUP_MAX_HOURS,
  MEETUP_MIN_CAPACITY,
  MEETUP_MIN_HOURS,
  SAFETY_KINDS,
} from './cruising-community.rules.js';
import { activeQuerySchema, COUNTRIES } from './cruising.schemas.js';

/** Meetups a list answers at most. */
export const MAX_MEETUPS_LISTED = 100;
/** Visitors a city lists at most. */
export const MAX_VISITORS_LISTED = 100;

const countryCodeField = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase());

// ---- Meetups (decision 88) -----------------------------------------------------------------------

export const meetupsQuerySchema = z
  .object({
    spotId: z.uuid().optional(),
    countryCode: countryCodeField.optional(),
    citySlug: slugSchema.optional(),
  })
  .refine((value) => !value.citySlug || !!value.countryCode, {
    message: 'A city needs its country',
    path: ['countryCode'],
  });
export type MeetupsQuery = z.infer<typeof meetupsQuerySchema>;

export const meetupSchema = z.object({
  spotId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  hours: z.number().int().min(MEETUP_MIN_HOURS).max(MEETUP_MAX_HOURS),
  title: z.string().trim().min(3).max(80),
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value ?? ''),
  capacity: z.number().int().min(MEETUP_MIN_CAPACITY).max(MEETUP_MAX_CAPACITY).nullish(),
});
export type MeetupInput = z.infer<typeof meetupSchema>;

export const attendanceSchema = z.object({ anonymous: z.boolean().default(false) });
export type AttendanceInput = z.infer<typeof attendanceSchema>;

// ---- Trips (decision 90) -------------------------------------------------------------------------

export const tripSchema = z.object({
  countryCode: z.enum(COUNTRIES),
  citySlug: slugSchema,
  from: z.iso.date(),
  to: z.iso.date(),
  listed: z.boolean().default(true),
});
export type TripInput = z.infer<typeof tripSchema>;

// ---- Safety alerts (decision 91) -----------------------------------------------------------------

export const safetyKindSchema = z.enum(SAFETY_KINDS);

export const safetyAlertSchema = z.object({
  kind: safetyKindSchema,
  note: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((value) => value || null),
});
export type SafetyAlertInput = z.infer<typeof safetyAlertSchema>;

/** The active alerts of a box of the map: the same 0.25° grid as active now (decision 86). */
export const safetyBoxQuerySchema = activeQuerySchema;
export type SafetyBoxQuery = z.infer<typeof safetyBoxQuerySchema>;
