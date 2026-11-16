/** Request schemas of Cruising's safety and health features (architecture 4.15, phase 5). */
import { z } from 'zod';
import { slugSchema } from '../../common/schemas/common.schemas.js';
import { COUNTRIES } from '../swipe/swipe.schemas.js';
import { parseBbox } from './cruising.rules.js';
import {
  PREP_STATUSES,
  TIMER_EXTEND_MIN_MINUTES,
  TIMER_MAX_MINUTES,
  TIMER_MIN_MINUTES,
} from './cruising-safety.rules.js';
import { IMPORT_MAX_BYTES } from './cruising.schemas.js';

// ---- Trusted contacts and the timer (decision 95) -------------------------------------------------

export const trustedContactSchema = z.object({
  email: z.email().max(254).toLowerCase(),
  /** How the member is named to this contact: not the nickname. */
  displayName: z.string().trim().min(1).max(40),
});
export type TrustedContactInput = z.infer<typeof trustedContactSchema>;

/** The answer from the invitation page, or a stop link (`accept: false`). */
export const contactResponseSchema = z.object({
  token: z.string().trim().min(10).max(200),
  accept: z.boolean(),
});
export type ContactResponseInput = z.infer<typeof contactResponseSchema>;

export const timerSchema = z
  .object({
    minutes: z.number().int().min(TIMER_MIN_MINUTES).max(TIMER_MAX_MINUTES),
    message: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((value) => value || null),
    shareSpot: z.boolean().default(false),
    spotId: z.uuid().nullish(),
  })
  .refine((value) => !value.shareSpot || !!value.spotId, {
    message: 'Choose the spot to share',
    path: ['spotId'],
  });
export type TimerInput = z.infer<typeof timerSchema>;

export const extendTimerSchema = z.object({
  minutes: z.number().int().min(TIMER_EXTEND_MIN_MINUTES).max(TIMER_MAX_MINUTES),
});
export type ExtendTimerInput = z.infer<typeof extendTimerSchema>;

// ---- Sexual health (decision 94) ------------------------------------------------------------------

/** `{ enabled: false }` turns it off and deletes the fields; turning it on needs `consent: true`. */
export const healthSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    /** Explicit consent (GDPR art. 9.2.a), separate from entry's: needed to turn it on. */
    consent: z.boolean().optional(),
    prepStatus: z.enum(PREP_STATUSES).nullable().default(null),
    /** `YYYY-MM`, checked against the current month by the service. */
    lastTestedMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'A month as YYYY-MM')
      .nullable()
      .default(null),
    visible: z.boolean().default(false),
    reminderMonths: z
      .union([z.literal(3), z.literal(6)])
      .nullable()
      .default(null),
  }),
]);
export type HealthInput = z.infer<typeof healthSchema>;

// ---- Testing centres (decision 94) ----------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const healthCenterShape = {
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  countryCode: z.enum(COUNTRIES),
  city: z.string().trim().min(1).max(80),
  url: z
    .url({ protocol: /^https?$/ })
    .max(300)
    .nullish()
    .transform((value) => value || null),
  phone: optionalText(40),
  free: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  rapid: z.boolean().default(false),
};

export const healthCenterSchema = z.object(healthCenterShape);
export type HealthCenterInput = z.infer<typeof healthCenterSchema>;

export const healthCenterPatchSchema = z
  .object({
    ...healthCenterShape,
    free: z.boolean(),
    anonymous: z.boolean(),
    rapid: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type HealthCenterPatch = z.infer<typeof healthCenterPatchSchema>;

/** A country and city, or a box of the map (`minLng,minLat,maxLng,maxLat`). */
export const healthCentersQuerySchema = z
  .object({
    countryCode: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    citySlug: slugSchema.optional(),
    bbox: z
      .string()
      .transform((value, ctx) => {
        const box = parseBbox(value);
        if (!box) {
          ctx.addIssue({ code: 'custom', message: 'bbox is minLng,minLat,maxLng,maxLat' });
          return z.NEVER;
        }
        return box;
      })
      .optional(),
  })
  .refine((value) => !value.citySlug || !!value.countryCode, {
    message: 'A city needs its country',
    path: ['countryCode'],
  });
export type HealthCentersQuery = z.infer<typeof healthCentersQuerySchema>;

export const importHealthCentersSchema = z.object({
  format: z.enum(['csv', 'geojson']),
  content: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= IMPORT_MAX_BYTES, {
      message: 'The file can be up to 2 MB',
    }),
  dryRun: z.boolean().default(false),
});
export type ImportHealthCentersInput = z.infer<typeof importHealthCentersSchema>;

export const adminCentersQuerySchema = z.object({ q: z.string().trim().max(100).optional() });
export type AdminCentersQuery = z.infer<typeof adminCentersQuerySchema>;
