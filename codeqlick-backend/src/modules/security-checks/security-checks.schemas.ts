import { isIP } from 'node:net';
import { z } from 'zod';
import { localeSchema, paginationSchema } from '../../common/schemas/common.schemas.js';

/** Top-level names that never resolve on the public internet (RFC 2606, 6761, 6762 and common). */
const RESERVED_TLDS = new Set([
  'local',
  'localhost',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'private',
  'test',
  'example',
  'invalid',
  'arpa',
  'onion',
  'localdomain',
]);

/**
 * A domain as people type it: a host name, or a URL reduced to its host. IP addresses,
 * `localhost`, names without a dot and private or reserved names are refused (architecture 4.19).
 * Becomes the lower-case host without a trailing dot.
 */
export const domainSchema = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .transform((value, context) => {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    let host: string;
    try {
      host = new URL(withScheme).hostname
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '')
        .toLowerCase();
    } catch {
      context.addIssue({ code: 'custom', message: 'Not a domain name' });
      return z.NEVER;
    }
    const tld = host.split('.').at(-1) ?? '';
    const valid =
      !isIP(host) &&
      /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(host) &&
      !RESERVED_TLDS.has(tld);
    if (!valid) {
      context.addIssue({ code: 'custom', message: 'Not a domain that can be checked' });
      return z.NEVER;
    }
    return host;
  });

export const createSecurityCheckSchema = z
  .object({
    domain: domainSchema,
    email: z.email().max(254),
    name: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || undefined),
    locale: localeSchema,
    acceptPrivacy: z.literal(true),
    /** Honeypot: humans never see this field. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type CreateSecurityCheckInput = z.infer<typeof createSecurityCheckSchema>;

export const reportQuerySchema = z.object({ locale: localeSchema.default('en') });
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const listSecurityChecksQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'DONE', 'FAILED']).optional(),
});
export type ListSecurityChecksQuery = z.infer<typeof listSecurityChecksQuerySchema>;
