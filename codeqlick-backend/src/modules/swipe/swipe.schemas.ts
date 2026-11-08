import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';
import {
  INTERESTS,
  MAX_INTERESTS,
  SUSPENSION_DURATIONS,
  ageOn,
  type Interest,
} from '../videochat/videochat.schemas.js';

export { ageOn, INTERESTS, MAX_INTERESTS, SUSPENSION_DURATIONS, type Interest };
export { suspensionEnd, type SuspensionDuration } from '../videochat/videochat.schemas.js';
/** Same shape as the video chat's: a browser's PushSubscription.toJSON() and its language. */
export {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type PushSubscriptionInput,
  type PushUnsubscribeInput,
} from '../videochat/videochat.schemas.js';

/** Version of Swipe's rules; bump it to ask everyone to accept them again. */
export const SWIPE_TERMS_VERSION = '2026-11-08.2';
export const SWIPE_MIN_AGE = 18;

/** Photos a person can have that aren't rejected or removed (pending or live). */
export const MAX_PHOTOS = 10;
/** Uploads (photos and verification photos) per account and day. */
export const UPLOADS_PER_DAY = 10;
/** Reports per account and day. */
export const REPORTS_PER_DAY = 20;
/** Largest upload accepted, in bytes. The website sends them smaller (about 1 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Cards sent at once. */
export const DECK_SIZE = 10;
/** Messages of a match's chat kept with a report about it. */
export const TRANSCRIPT_LINES = 30;
/** "Love" votes per account and day. */
export const SUPER_LIKES_PER_DAY = 3;
/** A vote can be undone this long after it was made (and only when it made no match). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;
/** Contact details are refused in a chat until each person has sent this many messages. */
export const SAFE_CHAT_MESSAGES = 5;
export const MIN_AGE_FILTER = 18;
export const MAX_AGE_FILTER = 99;

/** Countries a profile can name (ISO 3166-1 alpha-2): Spain, Latin America, Europe, the US. */
export const COUNTRIES = [
  'ES',
  'MX',
  'AR',
  'CO',
  'CL',
  'PE',
  'VE',
  'EC',
  'GT',
  'CU',
  'BO',
  'DO',
  'HN',
  'PY',
  'SV',
  'NI',
  'CR',
  'PA',
  'UY',
  'PR',
  'US',
  'CA',
  'GB',
  'IE',
  'FR',
  'PT',
  'IT',
  'DE',
  'NL',
  'BE',
  'CH',
  'AT',
  'SE',
  'NO',
  'DK',
  'FI',
  'PL',
  'RO',
  'GR',
  'AD',
  'AU',
] as const;
export type Country = (typeof COUNTRIES)[number];

export const GENDERS = ['WOMAN', 'MAN', 'NONBINARY'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

export const REPORT_REASONS = [
  'MINOR',
  'NON_CONSENSUAL',
  'STOLEN',
  'ILLEGAL',
  'HARASSMENT',
  'SPAM',
  'OTHER',
] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;
/** A photo reported for one of these is hidden at once, until the team reviews it. */
export const HIDE_AT_ONCE: readonly ReportReason[] = ['MINOR', 'NON_CONSENSUAL', 'STOLEN'];

/** Reasons a removal request can give (anyone, without an account). */
export const TAKEDOWN_REASONS = ['MINOR', 'NON_CONSENSUAL', 'STOLEN', 'ILLEGAL', 'OTHER'] as const;

export const onboardingSchema = z.object({
  /** YYYY-MM-DD. Checked (18+) and not stored. */
  birthDate: z.iso.date(),
  acceptTerms: z.literal(true),
  termsVersion: z.string().min(1).max(40),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const profileSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[\p{L}\p{N} ._-]+$/u, 'Letters, numbers, spaces, dots, dashes and underscores'),
  gender: genderSchema.nullable(),
  seeking: z
    .array(genderSchema)
    .max(3)
    .transform((list) => [...new Set(list)]),
  interests: z
    .array(z.enum(INTERESTS))
    .max(MAX_INTERESTS)
    .transform((list) => [...new Set(list)]),
  bio: z
    .string()
    .trim()
    .max(160)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  /** Only the year; checked against 18+ (for people who entered before it was asked). */
  birthYear: z.number().int().min(1900).nullable().default(null),
  country: z.enum(COUNTRIES).nullable().default(null),
  ageMin: z.number().int().min(MIN_AGE_FILTER).max(MAX_AGE_FILTER).default(MIN_AGE_FILTER),
  ageMax: z.number().int().min(MIN_AGE_FILTER).max(MAX_AGE_FILTER).default(MAX_AGE_FILTER),
  sameCountry: z.boolean().default(false),
  emailAlerts: z.boolean().default(true),
  blurPhotos: z.boolean().default(false),
});
export type SwipeProfileInput = z.infer<typeof profileSchema>;

/** The multipart fields sent with a photo: the uploader confirms it is them and they agree. */
export const uploadFieldsSchema = z.object({ consent: z.literal('true') });
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

export const voteSchema = z.object({
  photoId: z.uuid(),
  like: z.boolean(),
  /** A "love" (a like the owner is told about). */
  superLike: z.boolean().default(false),
});
export type VoteInput = z.infer<typeof voteSchema>;

export const messageSchema = z.object({ text: z.string().trim().min(1).max(1000) });
export type MessageInput = z.infer<typeof messageSchema>;

export const messagesQuerySchema = z.object({ after: z.iso.datetime({ offset: true }).optional() });
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const reportSchema = z
  .object({
    photoId: z.uuid().optional(),
    matchId: z.uuid().optional(),
    reason: reportReasonSchema,
    details: z.string().trim().max(1000).optional(),
  })
  .refine((value) => (value.photoId ? 1 : 0) + (value.matchId ? 1 : 0) === 1, {
    message: 'Report a photo or a match, one of them',
  });
export type ReportInput = z.infer<typeof reportSchema>;

/** "ABC-123", "#abc123", "abc 123" → "ABC123". */
export function normalizeRef(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const takedownSchema = z.object({
  email: z.email().max(254),
  photoRef: z.string().trim().max(40).optional(),
  reason: z.enum(TAKEDOWN_REASONS),
  details: z.string().trim().min(10).max(2000),
  locale: localeSchema.default('es'),
  /** Honeypot: people never fill it in. */
  website: z.string().max(200).optional(),
});
export type TakedownInput = z.infer<typeof takedownSchema>;

// ---- Admin ---------------------------------------------------------------------------------------

export const photosQuerySchema = z.object({
  status: z.enum(['PENDING', 'LIVE', 'REJECTED', 'HIDDEN']).default('PENDING'),
});
export type PhotosQuery = z.infer<typeof photosQuerySchema>;

export const verificationDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(300).optional(),
});
export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;

export const rejectPhotoSchema = z.object({
  reason: z.string().trim().min(1).max(300),
  /** Adds the image to the blocked list, so the same image can't be uploaded again. */
  block: z.boolean().default(false),
});
export type RejectPhotoInput = z.infer<typeof rejectPhotoSchema>;

export const reportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'DISMISSED', 'ACTIONED']).default('OPEN'),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export const reportActionSchema = z.object({
  /** Removes the reported photo for good (its file is deleted). */
  removePhoto: z.boolean().default(false),
  /** With removePhoto: blocks re-uploads of the same image. */
  blockImage: z.boolean().default(false),
  /** Suspends the reported person; null: no suspension. */
  suspend: z.enum(SUSPENSION_DURATIONS).nullable().default(null),
});
export type ReportActionInput = z.infer<typeof reportActionSchema>;

export const takedownsQuerySchema = z.object({
  status: z.enum(['OPEN', 'REMOVED', 'CLOSED']).default('OPEN'),
});
export type TakedownsQuery = z.infer<typeof takedownsQuerySchema>;

export const takedownDecisionSchema = z.object({
  /** True: the photo is removed for good and its image blocked. False: nothing to remove. */
  remove: z.boolean(),
  response: z.string().trim().max(2000).optional(),
});
export type TakedownDecision = z.infer<typeof takedownDecisionSchema>;

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  duration: z.enum(SUSPENSION_DURATIONS),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const userIdParamSchema = z.object({ userId: z.uuid() });
export type UserIdParam = z.infer<typeof userIdParamSchema>;
