import { z } from 'zod';

/** Version of the rules and terms people accept; bump it to ask everyone to accept them again. */
export const VIDEOCHAT_TERMS_VERSION = '2026-11-07';

/** Minimum age to use the video chat. */
export const VIDEOCHAT_MIN_AGE = 18;

/** Explicit content between adults is allowed, so nudity is not a reason (see schema.prisma). */
export const REPORT_REASONS = [
  'MINOR',
  'NON_CONSENSUAL',
  'ILLEGAL',
  'HARASSMENT',
  'HATE',
  'SPAM',
  'OTHER',
] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/** Age in whole years on `today` of someone born on `birthDate` (both YYYY-MM-DD, UTC). */
export function ageOn(birthDate: string, today: Date): number {
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export const onboardingSchema = z.object({
  /** YYYY-MM-DD. Checked (18+) and not stored. */
  birthDate: z.iso.date(),
  acceptTerms: z.literal(true),
  termsVersion: z.string().min(1).max(40),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const reportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'DISMISSED', 'ACTIONED']).default('OPEN'),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export const GENDERS = ['WOMAN', 'MAN', 'NONBINARY'] as const;

/** Interests a profile can show (a fixed list: nothing to moderate; architecture 4.7). */
export const INTERESTS = [
  'chat',
  'friends',
  'flirting',
  'music',
  'movies',
  'series',
  'gaming',
  'sports',
  'fitness',
  'travel',
  'books',
  'art',
  'photography',
  'tech',
  'food',
  'anime',
  'languages',
  'nature',
  'pets',
  'fashion',
  // Adult (+18) interests: the video chat allows explicit content between consenting adults.
  'spicy',
  'explicit',
  'showing',
  'watching',
  'roleplay',
  'fetish',
  'bdsm',
  'striptease',
  'mutual',
  'couples',
  'lgbtq',
  'nostrings',
] as const;
export type Interest = (typeof INTERESTS)[number];
export const MAX_INTERESTS = 5;
export const genderSchema = z.enum(GENDERS);

/** Public profile and matching filters (architecture 4.7). All free. */
export const settingsSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[\p{L}\p{N} ._-]+$/u, 'Letters, numbers, spaces, dots, dashes and underscores')
    .nullable(),
  gender: genderSchema.nullable(),
  seeking: z
    .array(genderSchema)
    .max(3)
    .transform((list) => [...new Set(list)]),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  language: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable(),
  sameCountryOnly: z.boolean(),
  sameLanguageOnly: z.boolean(),
  interests: z
    .array(z.enum(INTERESTS))
    .transform((list) => [...new Set(list)])
    .pipe(z.array(z.enum(INTERESTS)).max(MAX_INTERESTS))
    .default([]),
});
export type VideochatSettings = z.infer<typeof settingsSchema>;

/** What a partner sees of someone during a call. */
export interface PublicProfile {
  nickname: string | null;
  gender: (typeof GENDERS)[number] | null;
  country: string | null;
  language: string | null;
  interests: Interest[];
}

export const SUSPENSION_DURATIONS = ['24h', '7d', '30d', 'permanent'] as const;
export type SuspensionDuration = (typeof SUSPENSION_DURATIONS)[number];
const HOUR_MS = 60 * 60 * 1000;
const DURATION_MS: Record<SuspensionDuration, number | null> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
  permanent: null,
};

/** When a suspension of `duration` starting at `now` ends; null: until lifted. */
export function suspensionEnd(duration: SuspensionDuration, now: Date): Date | null {
  const ms = DURATION_MS[duration];
  return ms === null ? null : new Date(now.getTime() + ms);
}

export const suspendSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  duration: z.enum(SUSPENSION_DURATIONS).default('permanent'),
});
export type SuspendInput = z.infer<typeof suspendSchema>;

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  duration: z.enum(SUSPENSION_DURATIONS),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const appealSchema = z.object({
  message: z.string().trim().min(10).max(2_000),
});
export type AppealInput = z.infer<typeof appealSchema>;

/** A browser's Web Push subscription (PushSubscription.toJSON()) and the notification language. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2_000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  locale: z.enum(['en', 'es']).default('en'),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().min(1).max(2_000),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

export const appealsQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACCEPTED', 'REJECTED']).default('OPEN'),
});
export type AppealsQuery = z.infer<typeof appealsQuerySchema>;

export const appealDecisionSchema = z.object({
  response: z.string().trim().min(1).max(2_000).optional(),
});
export type AppealDecisionInput = z.infer<typeof appealDecisionSchema>;

export const userIdParamSchema = z.object({ userId: z.uuid() });
export type UserIdParam = z.infer<typeof userIdParamSchema>;

// --- WebSocket messages (browser → server) ----------------------------------------------------

const sdpSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1).max(20_000),
});

const candidateSchema = z.object({
  candidate: z.string().max(2_000),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
});

/** WebRTC negotiation, relayed as is to the partner. */
export const signalDataSchema = z.union([
  z.object({ sdp: sdpSchema }).strict(),
  z.object({ candidate: candidateSchema }).strict(),
]);
export type SignalData = z.infer<typeof signalDataSchema>;

export const CHAT_MAX_LENGTH = 500;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), ticket: z.string().min(16).max(128) }),
  z.object({ type: z.literal('join') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('leave') }),
  /** Search without my own filters, for this wait only. */
  z.object({ type: z.literal('widen') }),
  z.object({ type: z.literal('signal'), data: signalDataSchema }),
  z.object({ type: z.literal('chat'), text: z.string().trim().min(1).max(CHAT_MAX_LENGTH) }),
  z.object({
    type: z.literal('report'),
    reason: reportReasonSchema,
    details: z.string().trim().max(1_000).optional(),
  }),
  z.object({ type: z.literal('block') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Server → browser. */
export type ServerMessage =
  | { type: 'ready' }
  /**
   * `others`: people waiting who can't be paired with this one now (filters, blocks, cooldown);
   * `filtered`: this person has filters; `widened`: this wait ignores them.
   */
  | { type: 'waiting'; others: number; filtered: boolean; widened: boolean }
  | { type: 'matched'; initiator: boolean; partner: PublicProfile }
  | { type: 'signal'; data: SignalData }
  | { type: 'chat'; text: string }
  | { type: 'partner-left' }
  | { type: 'reported' }
  | { type: 'blocked' }
  | { type: 'suspended' }
  | { type: 'error'; code: VideochatErrorCode };

export type VideochatErrorCode =
  | 'bad-message'
  | 'not-authenticated'
  | 'invalid-ticket'
  | 'rate-limited'
  | 'no-partner'
  | 'replaced';
