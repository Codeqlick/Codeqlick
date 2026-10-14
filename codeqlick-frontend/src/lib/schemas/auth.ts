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
