import 'server-only';
import { z } from 'zod';

/**
 * Server-side environment, validated once per process.
 * Only NEXT_PUBLIC_SITE_URL may ever reach the browser; API_URL and SITE_URL stay on the server.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_URL: z.url().default('http://localhost:4000/v1'),
  SITE_URL: z.url().default('https://codeqlick.com'),
  /** Umami (self-hosted analytics), reached from the server only. Unset: no analytics. */
  UMAMI_URL: z.url().optional(),
  UMAMI_WEBSITE_ID: z.uuid().optional(),
  /** Owner shown on the legal pages; without a name those pages (and their links) are hidden. */
  LEGAL_OWNER_NAME: z.string().trim().min(1).optional(),
  LEGAL_OWNER_TAX_ID: z.string().trim().min(1).optional(),
  LEGAL_OWNER_ADDRESS: z.string().trim().min(1).optional(),
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  API_URL: process.env.API_URL || undefined,
  SITE_URL: process.env.SITE_URL || undefined,
  UMAMI_URL: process.env.UMAMI_URL || undefined,
  UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID || undefined,
  LEGAL_OWNER_NAME: process.env.LEGAL_OWNER_NAME || undefined,
  LEGAL_OWNER_TAX_ID: process.env.LEGAL_OWNER_TAX_ID || undefined,
  LEGAL_OWNER_ADDRESS: process.env.LEGAL_OWNER_ADDRESS || undefined,
});

if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const env = {
  ...parsed.data,
  /** API base URL without a trailing slash, e.g. http://localhost:4000/v1 */
  API_URL: parsed.data.API_URL.replace(/\/+$/, ''),
  /** Public site URL without a trailing slash, e.g. https://codeqlick.com */
  SITE_URL: parsed.data.SITE_URL.replace(/\/+$/, ''),
  isProduction: parsed.data.NODE_ENV === 'production',
  /** Umami base URL without a trailing slash, when analytics is set up. */
  UMAMI_URL: parsed.data.UMAMI_URL?.replace(/\/+$/, ''),
};

/** The legal pages' owner, or undefined while LEGAL_OWNER_NAME isn't set. */
export const legalOwner = parsed.data.LEGAL_OWNER_NAME
  ? {
      name: parsed.data.LEGAL_OWNER_NAME,
      taxId: parsed.data.LEGAL_OWNER_TAX_ID,
      address: parsed.data.LEGAL_OWNER_ADDRESS,
    }
  : undefined;
