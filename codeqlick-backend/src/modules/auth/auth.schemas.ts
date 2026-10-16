import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';

export const loginSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).max(512),
  })
  .strict();
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = refreshSchema;
export type LogoutInput = RefreshInput;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(12).max(256),
    /** The caller's own session, which stays signed in; every other session is revoked. */
    refreshToken: z.string().min(1).max(512),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const signupFields = {
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(256),
  /** Language of their emails. */
  locale: localeSchema,
  /** They read and accept the privacy policy. */
  acceptPrivacy: z.literal(true),
};

/** Self-registration (decision 17). */
export const registerSchema = z
  .object({
    ...signupFields,
    email: z.email().max(254),
    /** Honeypot: humans never see this field, bots fill it in. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const confirmSignupSchema = z.object({ token: z.string().min(1).max(512) }).strict();
export type ConfirmSignupInput = z.infer<typeof confirmSignupSchema>;

/** Accepting the team's invitation: its token proves the email. */
export const acceptInvitationSchema = z
  .object({ ...signupFields, token: z.string().min(1).max(512) })
  .strict();
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const requestPasswordResetSchema = z
  .object({
    email: z.email().max(254),
    /** Language of the email and of the page its link opens. */
    locale: localeSchema.default('en'),
  })
  .strict();
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z
  .object({
    token: z.string().min(1).max(512),
    newPassword: z.string().min(12).max(256),
  })
  .strict();
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;

/** A 6-digit authenticator code or a recovery code (`xxxx-xxxx`). */
const twoFactorCodeSchema = z.string().trim().min(6).max(32);

export const verifyTwoFactorSchema = z
  .object({ challengeToken: z.string().min(1).max(2048), code: twoFactorCodeSchema })
  .strict();
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>;

export const enableTwoFactorSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict();
export type EnableTwoFactorInput = z.infer<typeof enableTwoFactorSchema>;

export const disableTwoFactorSchema = z
  .object({ password: z.string().min(1).max(1024), code: twoFactorCodeSchema })
  .strict();
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorSchema>;

export const preferencesSchema = z
  .object({ weeklyDigest: z.boolean().optional(), monthlyReport: z.boolean().optional() })
  .strict();
export type PreferencesInput = z.infer<typeof preferencesSchema>;
