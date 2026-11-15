import { z } from 'zod';
import {
  localeSchema,
  paginationSchema,
  slugSchema,
} from '../../common/schemas/common.schemas.js';
import { COUNTRIES } from '../swipe/swipe.schemas.js';
import { SUSPENSION_DURATIONS, ageOn } from '../videochat/videochat.schemas.js';
import { parseBbox } from './cruising.rules.js';

export { ageOn, COUNTRIES, SUSPENSION_DURATIONS };
export { suspensionEnd, type SuspensionDuration } from '../videochat/videochat.schemas.js';

/** Cruising is for adults. Declared age, checked on entry and not stored (decision 27). */
export const CRUISING_MIN_AGE = 18;
/** Spots a member can propose per day. */
export const SPOTS_PER_DAY = 5;
/** Reviews a member can write or edit per day. */
export const REVIEWS_PER_DAY = 10;
/** Reports per account and day. */
export const REPORTS_PER_DAY = 20;
/** Spots the map returns for one box. */
export const MAX_SPOTS_IN_BOX = 500;
/** Spots of a city page. */
export const MAX_SPOTS_IN_CITY = 200;
/** Rows of the team's lists. */
export const ADMIN_LIST_LIMIT = 200;

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
export const spotTypeSchema = z.enum(SPOT_TYPES);
export type SpotType = z.infer<typeof spotTypeSchema>;

export const SPOT_STATUSES = ['PENDING', 'LIVE', 'REJECTED', 'HIDDEN'] as const;
export type SpotStatus = (typeof SPOT_STATUSES)[number];

export const REPORT_REASONS = [
  'MINOR',
  'ILLEGAL',
  'DANGER',
  'WRONG_INFO',
  'HARASSMENT',
  'SPAM',
  'OTHER',
] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;
/** A spot or review reported for one of these is hidden at once, until the team reviews it. */
export const HIDE_AT_ONCE: readonly ReportReason[] = ['MINOR', 'ILLEGAL'];

/** Reasons a removal request can give (anyone, without an account). */
export const TAKEDOWN_REASONS = ['MINOR', 'ILLEGAL', 'DANGER', 'OTHER'] as const;

export const onboardingSchema = z.object({
  /** YYYY-MM-DD. Checked (18+) and not stored. */
  birthDate: z.iso.date(),
  acceptTerms: z.literal(true),
  /** Explicit consent to special category data (sexual orientation and sex life, GDPR art. 9.2.a). */
  consentSpecialData: z.literal(true),
  termsVersion: z.string().min(1).max(40),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Phase 1: only the email switch; phase 2 adds the nickname, bio, country, lookingFor, showAge. */
export const profileSchema = z.object({ emailAlerts: z.boolean().optional() });
export type ProfileInput = z.infer<typeof profileSchema>;

// ---- Spots ---------------------------------------------------------------------------------------

const spotShape = {
  name: z.string().trim().min(2).max(80),
  type: spotTypeSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  countryCode: z.enum(COUNTRIES),
  city: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
};
const bestTimesField = z.string().trim().max(200).nullable();

export const spotSchema = z.object({ ...spotShape, bestTimes: bestTimesField.optional() });
export type SpotInput = z.infer<typeof spotSchema>;

/** Any of the fields of a spot (the proposer's edit and the team's correction). */
export const spotPatchSchema = z
  .object({ ...spotShape, bestTimes: bestTimesField })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type SpotPatch = z.infer<typeof spotPatchSchema>;

export const bboxQuerySchema = z.object({
  bbox: z.string().transform((value, ctx) => {
    const box = parseBbox(value);
    if (!box) {
      ctx.addIssue({
        code: 'custom',
        message:
          'bbox is minLng,minLat,maxLng,maxLat with minLng < maxLng, minLat < maxLat, longitudes -180..180 and latitudes -90..90',
      });
      return z.NEVER;
    }
    return box;
  }),
  type: spotTypeSchema.optional(),
});
export type BboxQuery = z.infer<typeof bboxQuerySchema>;

export const placeParamsSchema = z.object({
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase()),
  citySlug: slugSchema,
});
export type PlaceParams = z.infer<typeof placeParamsSchema>;

// ---- Reviews and reports -------------------------------------------------------------------------

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((value) => value || null),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const reviewsQuerySchema = paginationSchema;
export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;

export const reportSchema = z
  .object({
    spotId: z.uuid().optional(),
    reviewId: z.uuid().optional(),
    reason: reportReasonSchema,
    details: z.string().trim().max(1000).optional(),
  })
  .refine((value) => (value.spotId ? 1 : 0) + (value.reviewId ? 1 : 0) === 1, {
    message: 'Report a spot or a review, one of them',
  })
  .refine((value) => value.reason !== 'WRONG_INFO' || !!value.details, {
    message: 'Say what is wrong',
    path: ['details'],
  });
export type ReportInput = z.infer<typeof reportSchema>;

export const takedownSchema = z.object({
  email: z.email().max(254),
  /** A link ending in `/spots/<slug>`, or the slug. */
  spotLink: z.string().trim().max(300).optional(),
  reason: z.enum(TAKEDOWN_REASONS),
  details: z.string().trim().min(10).max(2000),
  locale: localeSchema.default('en'),
  /** Honeypot: people never fill it in. */
  website: z.string().max(200).optional(),
});
export type TakedownInput = z.infer<typeof takedownSchema>;

// ---- Admin ---------------------------------------------------------------------------------------

export const adminSpotsQuerySchema = z.object({
  status: z.enum(SPOT_STATUSES).default('PENDING'),
  q: z.string().trim().max(100).optional(),
});
export type AdminSpotsQuery = z.infer<typeof adminSpotsQuerySchema>;

export const rejectSpotSchema = z.object({ reason: z.string().trim().min(5).max(500) });
export type RejectSpotInput = z.infer<typeof rejectSpotSchema>;

export const reportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'DISMISSED', 'ACTIONED']).default('OPEN'),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export const reportActionSchema = z.object({
  /** Rejects the reported spot or deletes the reported review. */
  remove: z.boolean().default(false),
  /** Suspends the reported person; null: no suspension. */
  suspend: z.enum(SUSPENSION_DURATIONS).nullable().default(null),
  /** Shown to the proposer when a spot is removed. */
  reason: z.string().trim().max(500).optional(),
});
export type ReportActionInput = z.infer<typeof reportActionSchema>;

export const takedownsQuerySchema = z.object({
  status: z.enum(['OPEN', 'REMOVED', 'CLOSED']).default('OPEN'),
});
export type TakedownsQuery = z.infer<typeof takedownsQuerySchema>;

export const takedownDecisionSchema = z.object({
  /** True: the spot is removed (it becomes REJECTED). False: closed, the spot is restored. */
  remove: z.boolean(),
  response: z.string().trim().max(2000).optional(),
});
export type TakedownDecision = z.infer<typeof takedownDecisionSchema>;

export const suspendUserSchema = z.object({
  duration: z.enum(SUSPENSION_DURATIONS),
  reason: z.string().trim().max(500).optional(),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const userIdParamSchema = z.object({ userId: z.uuid() });
export type UserIdParam = z.infer<typeof userIdParamSchema>;
