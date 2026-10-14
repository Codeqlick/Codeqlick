import { z } from 'zod';

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
