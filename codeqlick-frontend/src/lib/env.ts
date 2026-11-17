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
  /** The API as people reach it (shown in instructions); see `PUBLIC_API_URL` below. */
  PUBLIC_API_URL: z.url().optional(),
  /** Umami (self-hosted analytics), reached from the server only. Unset: no analytics. */
  UMAMI_URL: z.url().optional(),
  UMAMI_WEBSITE_ID: z.uuid().optional(),
  /** Owner shown on the legal pages; without a name those pages (and their links) are hidden. */
  LEGAL_OWNER_NAME: z.string().trim().min(1).optional(),
  LEGAL_OWNER_TAX_ID: z.string().trim().min(1).optional(),
  LEGAL_OWNER_ADDRESS: z.string().trim().min(1).optional(),
  /**
   * Neoqlick (architecture 4.18): its main host (`https://neoqlick.com`). Unset where there are no
   * Neoqlick hosts (staging); the hosts of the brand then do not exist for this server.
   */
  NEOQLICK_URL: z.url().optional(),
  /** Umami's website id for Neoqlick's hosts (same Umami as Codeqlick's, its own site). */
  NEOQLICK_UMAMI_WEBSITE_ID: z.uuid().optional(),
  /** The operator behind Neoqlick; each falls back to the matching `LEGAL_OWNER_*`. */
  NEOQLICK_TRADE_NAME: z.string().trim().min(1).optional(),
  NEOQLICK_LEGAL_OWNER_NAME: z.string().trim().min(1).optional(),
  NEOQLICK_LEGAL_OWNER_TAX_ID: z.string().trim().min(1).optional(),
  NEOQLICK_LEGAL_OWNER_ADDRESS: z.string().trim().min(1).optional(),
  /** Where managed sites and request previews are previewed: <slug>.<this>. */
  SITES_PREVIEW_DOMAIN: z.string().min(3).default('demo.codeqlick.com'),
  /** Codeqlick Cloud's hosting domain (architecture 4.13), shown in its docs and terms. */
  CLOUD_HOSTING_DOMAIN: z.string().min(3).default('codeqlick.app'),
  /** The public documentation site (e.g. https://docs.codeqlick.com); unset: the console's /docs. */
  CLOUD_DOCS_URL: z.url({ protocol: /^https?$/ }).optional(),
  /**
   * The video chat's signaling WebSocket as browsers open it. Unset: wss://<the page's host>/ws in
   * production (Nginx sends it to the API), the local API otherwise.
   */
  VIDEOCHAT_WS_URL: z.url().optional(),
  MEETINGS_WS_URL: z.url().optional(),
  /** Cloudflare Turnstile's public site key: sign-in and sign-up show its widget; unset: none. */
  TURNSTILE_SITE_KEY: z.string().trim().min(1).optional(),
  /** Neoqlick's own widget (its own Cloudflare account); unset: none on its hosts. */
  TURNSTILE_SITE_KEY_NEOQLICK: z.string().trim().min(1).optional(),
  /**
   * Single sign-on through the account host (decision 108). `false` only where there is no account
   * host (staging): sign-in and the account pages then stay on the same host.
   */
  ACCOUNT_SSO: z.enum(['true', 'false']).default('true'),
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  API_URL: process.env.API_URL || undefined,
  SITE_URL: process.env.SITE_URL || undefined,
  PUBLIC_API_URL: process.env.PUBLIC_API_URL || undefined,
  UMAMI_URL: process.env.UMAMI_URL || undefined,
  UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID || undefined,
  LEGAL_OWNER_NAME: process.env.LEGAL_OWNER_NAME || undefined,
  LEGAL_OWNER_TAX_ID: process.env.LEGAL_OWNER_TAX_ID || undefined,
  LEGAL_OWNER_ADDRESS: process.env.LEGAL_OWNER_ADDRESS || undefined,
  NEOQLICK_URL: process.env.NEOQLICK_URL || undefined,
  NEOQLICK_UMAMI_WEBSITE_ID: process.env.NEOQLICK_UMAMI_WEBSITE_ID || undefined,
  NEOQLICK_TRADE_NAME: process.env.NEOQLICK_TRADE_NAME || undefined,
  NEOQLICK_LEGAL_OWNER_NAME: process.env.NEOQLICK_LEGAL_OWNER_NAME || undefined,
  NEOQLICK_LEGAL_OWNER_TAX_ID: process.env.NEOQLICK_LEGAL_OWNER_TAX_ID || undefined,
  NEOQLICK_LEGAL_OWNER_ADDRESS: process.env.NEOQLICK_LEGAL_OWNER_ADDRESS || undefined,
  SITES_PREVIEW_DOMAIN: process.env.SITES_PREVIEW_DOMAIN || undefined,
  CLOUD_HOSTING_DOMAIN: process.env.CLOUD_HOSTING_DOMAIN || undefined,
  CLOUD_DOCS_URL: process.env.CLOUD_DOCS_URL || undefined,
  VIDEOCHAT_WS_URL: process.env.VIDEOCHAT_WS_URL || undefined,
  MEETINGS_WS_URL: process.env.MEETINGS_WS_URL || undefined,
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || undefined,
  TURNSTILE_SITE_KEY_NEOQLICK: process.env.TURNSTILE_SITE_KEY_NEOQLICK || undefined,
  ACCOUNT_SSO: process.env.ACCOUNT_SSO || undefined,
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
  /**
   * The API's public address, for instructions shown to people (the release endpoint). API_URL
   * can be internal (http://api:4000 in Docker), so: PUBLIC_API_URL when set, else
   * `https://api.<site host>/v1`, or the local API when the site runs on localhost.
   */
  PUBLIC_API_URL: (
    parsed.data.PUBLIC_API_URL ??
    (new URL(parsed.data.SITE_URL).hostname === 'localhost'
      ? 'http://localhost:4000/v1'
      : `https://api.${new URL(parsed.data.SITE_URL).host}/v1`)
  ).replace(/\/+$/, ''),
  /** Neoqlick's main URL without a trailing slash, when there are Neoqlick hosts. */
  NEOQLICK_URL: parsed.data.NEOQLICK_URL?.replace(/\/+$/, ''),
  /** Umami base URL without a trailing slash, when analytics is set up. */
  UMAMI_URL: parsed.data.UMAMI_URL?.replace(/\/+$/, ''),
  /** Documentation site URL without a trailing slash, when it is set up. */
  CLOUD_DOCS_URL: parsed.data.CLOUD_DOCS_URL?.replace(/\/+$/, ''),
};

/** The legal pages' owner, or undefined while LEGAL_OWNER_NAME isn't set. */
export const legalOwner = parsed.data.LEGAL_OWNER_NAME
  ? {
      name: parsed.data.LEGAL_OWNER_NAME,
      taxId: parsed.data.LEGAL_OWNER_TAX_ID,
      address: parsed.data.LEGAL_OWNER_ADDRESS,
    }
  : undefined;

/**
 * The operator of Neoqlick's legal pages (architecture 4.18, decision 129): `NEOQLICK_LEGAL_*`,
 * each falling back to the matching `LEGAL_OWNER_*` until a company exists. Undefined while no
 * holder name is set, so the legal pages (and their links) are hidden, like Codeqlick's.
 */
const neoqlickName = parsed.data.NEOQLICK_LEGAL_OWNER_NAME ?? parsed.data.LEGAL_OWNER_NAME;
export const neoqlickLegalOwner = neoqlickName
  ? {
      name: neoqlickName,
      taxId: parsed.data.NEOQLICK_LEGAL_OWNER_TAX_ID ?? parsed.data.LEGAL_OWNER_TAX_ID,
      address: parsed.data.NEOQLICK_LEGAL_OWNER_ADDRESS ?? parsed.data.LEGAL_OWNER_ADDRESS,
    }
  : undefined;
/** The trade name Neoqlick is presented under (default `Neoqlick`). */
export const NEOQLICK_TRADE_NAME = parsed.data.NEOQLICK_TRADE_NAME ?? 'Neoqlick';
