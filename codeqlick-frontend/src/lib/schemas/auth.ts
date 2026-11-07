import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  password: z.string().min(1, 'required').max(256, 'tooLong'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'required').max(256, 'tooLong'),
    newPassword: z.string().min(12, 'password').max(256, 'tooLong'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
});

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(12, 'password').max(256, 'tooLong'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });

/** The sign-up form (decision 17); `email` is left out when the invitation fixes it. */
export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'required').max(120, 'tooLong'),
    email: z.string().trim().min(1, 'required').pipe(z.email('email')),
    password: z.string().min(12, 'password').max(256, 'tooLong'),
    confirmPassword: z.string(),
    acceptPrivacy: z.literal(true, 'privacy'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });
