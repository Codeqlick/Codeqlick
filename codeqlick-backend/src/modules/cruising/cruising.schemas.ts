import { z } from 'zod';
import { localeSchema, paginationSchema, slugSchema } from '../../common/schemas/common.schemas.js';
import { COUNTRIES, SAFE_CHAT_MESSAGES, TRANSCRIPT_LINES } from '../swipe/swipe.schemas.js';
import { SUSPENSION_DURATIONS, ageOn } from '../videochat/videochat.schemas.js';
import { isReservedNickname, parseBbox } from './cruising.rules.js';

export { ageOn, COUNTRIES, SAFE_CHAT_MESSAGES, SUSPENSION_DURATIONS, TRANSCRIPT_LINES };
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
/** Check-ins a member can make per day. */
export const CHECK_INS_PER_DAY = 10;
/** New conversations a member can open per day. */
export const CONVERSATIONS_PER_DAY = 10;
/** Longest message. */
export const MAX_MESSAGE_LENGTH = 1000;
/** Messages a conversation shows at once. */
export const MESSAGES_PAGE = 100;
/** Cap on the blocks and conversations a list returns. */
export const MAX_LIST_ROWS = 200;
/** Places and spots a search answers, of each (decision 86). */
export const SEARCH_LIMIT = 8;
/** Active spots one box of the map answers (a box is rarely this busy). */
export const MAX_ACTIVE_IN_BOX = 500;

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

export const SPOT_STATUSES = ['PENDING', 'LIVE', 'REJECTED', 'HIDDEN', 'REMOVED'] as const;
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

export const LOOKING_FOR = ['CHAT', 'FRIENDS', 'DATES', 'FUN', 'GROUP'] as const;
export const lookingForSchema = z.enum(LOOKING_FOR);
export type LookingFor = z.infer<typeof lookingForSchema>;

/** 3-20 characters of a-z, 0-9 and `_`, lower-cased on save. */
export const NICKNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** A nickname someone chooses: its format and the reserved words (they pose as the team). */
export const nicknameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(NICKNAME_PATTERN, 'Nicknames have 3 to 20 characters: a-z, 0-9 and _')
  .refine((value) => !isReservedNickname(value), { message: 'This nickname is not available' });

/** A nickname someone looks up: anything unknown is a 404, not a 400. */
export const nicknameLookupSchema = z.string().trim().toLowerCase().min(1).max(40);

export const nicknameParamSchema = z.object({ nickname: nicknameLookupSchema });
export type NicknameParam = z.infer<typeof nicknameParamSchema>;

/** The email switch and, from phase 2, the nickname, bio, country, what I look for and the age switch. */
export const profileSchema = z.object({
  emailAlerts: z.boolean().optional(),
  nickname: nicknameSchema.optional(),
  bio: z.string().trim().max(160).optional(),
  country: z.enum(COUNTRIES).nullable().optional(),
  lookingFor: z
    .array(lookingForSchema)
    .max(LOOKING_FOR.length)
    .transform((list) => [...new Set(list)])
    .optional(),
  showAge: z.boolean().optional(),
});
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

/** `minLng,minLat,maxLng,maxLat`, checked by `parseBbox`. */
const bboxField = z.string().transform((value, ctx) => {
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
});

export const bboxQuerySchema = z.object({
  bbox: bboxField,
  type: spotTypeSchema.optional(),
  /** Phase 3: only spots rated at least this (spots with no rating are left out). */
  minRating: z.coerce.number().int().min(1).max(5).optional(),
});
export type BboxQuery = z.infer<typeof bboxQuerySchema>;

/** Phase 3: the active spots of a box of the map (the same grid as `/cruising/spots`). */
export const activeQuerySchema = z.object({ bbox: bboxField });
export type ActiveQuery = z.infer<typeof activeQuerySchema>;

/** Phase 3: a search by text, 2-60 characters (accents and case are ignored by the query). */
export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(60) });
export type SearchQuery = z.infer<typeof searchQuerySchema>;

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
    /** Phase 2: a profile. */
    nickname: nicknameLookupSchema.optional(),
    /** Phase 2: a conversation I am in; its last messages are saved with the report. */
    conversationId: z.uuid().optional(),
    reason: reportReasonSchema,
    details: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) =>
      [value.spotId, value.reviewId, value.nickname, value.conversationId].filter(Boolean)
        .length === 1,
    { message: 'Report a spot, a review, a profile or a conversation, one of them' },
  )
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

// ---- Check-ins, conversations, blocks (phase 2) --------------------------------------------------

export const CHECK_IN_HOURS = [1, 2, 3] as const;

export const checkInSchema = z.object({
  spotId: z.uuid(),
  hours: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  anonymous: z.boolean().default(false),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const openConversationSchema = z.object({ nickname: nicknameLookupSchema });
export type OpenConversationInput = z.infer<typeof openConversationSchema>;

export const messageSchema = z.object({ text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) });
export type MessageInput = z.infer<typeof messageSchema>;

export const messagesQuerySchema = z.object({ after: z.iso.datetime({ offset: true }).optional() });
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const blockSchema = z.object({ nickname: nicknameLookupSchema });
export type BlockInput = z.infer<typeof blockSchema>;

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
  /** True: the spot is removed (it becomes REMOVED, final). False: closed, the spot is restored. */
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
