import { isIP } from 'node:net';
import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';

/**
 * A website's address as people type it: `https://` is added when there is no scheme; only http(s)
 * on the standard ports, without credentials, with a real domain name (no IPs, no `localhost`).
 * Becomes the normalised URL without its fragment.
 */
export const websiteUrlSchema = z
  .string()
  .trim()
  .min(4)
  .max(500)
  .transform((value, context) => {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      context.addIssue({ code: 'custom', message: 'Not a website address' });
      return z.NEVER;
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const valid =
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.port === '' &&
      !isIP(host) &&
      /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i.test(host);
    if (!valid) {
      context.addIssue({ code: 'custom', message: 'Not a website address' });
      return z.NEVER;
    }
    url.hash = '';
    url.hostname = host.toLowerCase().replace(/\.$/, '');
    return url.toString();
  });

export const createSiteAuditSchema = z
  .object({
    url: websiteUrlSchema,
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
export type CreateSiteAuditInput = z.infer<typeof createSiteAuditSchema>;

export const reportQuerySchema = z.object({ locale: localeSchema.default('en') });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
