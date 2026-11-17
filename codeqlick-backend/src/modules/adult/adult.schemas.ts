import { z } from 'zod';
import { SUSPENSION_DURATIONS } from '../videochat/videochat.schemas.js';
import { ADULT_APPS, SERIOUS_CATEGORIES, SUSPENSION_CATEGORIES } from './adult.rules.js';

export const adultAppSchema = z.enum(ADULT_APPS);
export type AdultAppInput = z.infer<typeof adultAppSchema>;

/** Any category a moderator can give a suspension (decision 114). */
export const suspensionCategorySchema = z.enum(SUSPENSION_CATEGORIES);

/** `?app=`: the app asking (names and the verification's source app). */
export const appQuerySchema = z.object({ app: adultAppSchema });
export type AppQuery = z.infer<typeof appQuerySchema>;

export const blockRefParamSchema = z.object({ ref: z.string().regex(/^[0-9a-f]{24}$/) });
export type BlockRefParam = z.infer<typeof blockRefParamSchema>;

export const userIdParamSchema = z.object({ userId: z.uuid() });
export type UserIdParam = z.infer<typeof userIdParamSchema>;

export const reviewParamSchema = z.object({ app: adultAppSchema, userId: z.uuid() });
export type ReviewParam = z.infer<typeof reviewParamSchema>;

export const verificationDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(300).optional(),
});
export type AdultVerificationDecision = z.infer<typeof verificationDecisionSchema>;

export const withdrawVerificationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type WithdrawVerificationInput = z.infer<typeof withdrawVerificationSchema>;

export const sharedSuspensionSchema = z.object({
  category: z.enum(SERIOUS_CATEGORIES),
  sourceApp: adultAppSchema,
  reason: z.string().trim().min(1).max(500),
  duration: z.enum(SUSPENSION_DURATIONS),
  reportId: z.uuid().optional(),
});
export type SharedSuspensionInput = z.infer<typeof sharedSuspensionSchema>;

export const liftSuspensionSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type LiftSuspensionInput = z.infer<typeof liftSuspensionSchema>;

export const bannedEmailSchema = z.object({ email: z.email().max(254) });
export type BannedEmailInput = z.infer<typeof bannedEmailSchema>;
