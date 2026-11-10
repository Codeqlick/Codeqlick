import { z } from 'zod';

/**
 * Mirrors POST /v1/site-audits for instant feedback; the API checks the address for real.
 * Issue messages are Validation message keys.
 */
export const websiteCheckSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'required')
    .max(500, 'tooLong')
    .regex(/^(https?:\/\/)?[^\s/:]+\.[a-z]{2,}(?:[/?#]\S*)?$/i, 'website'),
  email: z.string().trim().min(1, 'required').max(254, 'tooLong').pipe(z.email('email')),
  name: z.string().trim().max(120, 'tooLong'),
  acceptPrivacy: z.literal('on', 'privacy'),
});

export const WEBSITE_CHECK_FIELDS = ['url', 'email', 'name', 'acceptPrivacy'] as const;
