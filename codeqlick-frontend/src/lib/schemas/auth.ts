import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  password: z.string().min(1, 'required').max(256, 'tooLong'),
});
