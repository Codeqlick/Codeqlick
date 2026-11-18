import { z } from 'zod';

/**
 * Mirrors POST /v1/security-checks for instant feedback; the API checks the domain for real
 * (IP addresses, private and reserved names are refused there). Issue messages are Validation keys.
 */
export const securityCheckSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, 'required')
    .max(500, 'tooLong')
    .regex(/^(https?:\/\/)?[^\s/:]+\.[a-z]{2,}(?:[/?#]\S*)?$/i, 'domain'),
  email: z.string().trim().min(1, 'required').max(254, 'tooLong').pipe(z.email('email')),
  name: z.string().trim().max(120, 'tooLong'),
  acceptPrivacy: z.literal('on', 'privacy'),
});

export const SECURITY_CHECK_FIELDS = ['domain', 'email', 'name', 'acceptPrivacy'] as const;
