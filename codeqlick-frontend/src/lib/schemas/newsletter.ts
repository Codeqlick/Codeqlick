import { z } from 'zod';

/**
 * Mirrors POST /v1/newsletter validation for instant feedback; the API stays the source of truth.
 * Issue messages are Validation message keys.
 */
export const newsletterSchema = z.object({
  email: z.string().trim().min(1, 'required').max(254, 'tooLong').pipe(z.email('email')),
  acceptPrivacy: z.literal('on', 'privacy'),
});

export const NEWSLETTER_FIELDS = ['email', 'acceptPrivacy'] as const;
