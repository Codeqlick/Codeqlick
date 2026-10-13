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
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  API_URL: process.env.API_URL || undefined,
  SITE_URL: process.env.SITE_URL || undefined,
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
};
