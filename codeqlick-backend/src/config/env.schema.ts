import { z } from 'zod';

/** Treats empty strings (e.g. `SMTP_USER=` in a .env file) as "not set". */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional(),
);

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .url()
    .optional()
    .transform((value) => value?.replace(/\/+$/, '')),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  /** Public URL of the website, used for links in emails (no trailing slash needed). */
  SITE_URL: z
    .url()
    .default('http://localhost:3000')
    .transform((value) => value.replace(/\/+$/, '')),
  /**
   * The account host (single sign-on, decision 108), for links in emails. Unset: SITE_URL with
   * `account.` before its host.
   */
  ACCOUNT_URL: z
    .url()
    .optional()
    .transform((value) => value?.replace(/\/+$/, '')),
  /**
   * Neoqlick's main host (architecture 4.18), for links in emails and the origin CORS allows. Unset
   * where there are no Neoqlick hosts (staging, development without them): NEOQLICK accounts then
   * fall back to the website's hosts. The realms work without it.
   */
  NEOQLICK_URL: optionalUrl,
  /** Neoqlick's account host. Unset: NEOQLICK_URL with `account.` before its host. */
  NEOQLICK_ACCOUNT_URL: optionalUrl,
  /** The API as Neoqlick's emails point to it (`https://api.neoqlick.com/v1`). Unset: PUBLIC_API_URL. */
  NEOQLICK_PUBLIC_API_URL: optionalUrl,
  JWT_ACCESS_SECRET: z.string().min(32),
  /** Encrypts the access clients share (project credentials). Unset: derived from JWT_ACCESS_SECRET. */
  CREDENTIALS_SECRET: z.string().min(32).optional(),
  /**
   * Keys the hash of a deleted account's email after a serious 18+ suspension (architecture 4.16,
   * decision 120). Unset: derived from CREDENTIALS_SECRET (or JWT_ACCESS_SECRET). Changing it makes
   * the stored hashes match nothing.
   */
  ADULT_BAN_HASH_KEY: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(32).optional(),
  ),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  SMTP_SECURE: booleanString,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  /** Tests only (NODE_ENV=test): each email is also written there as JSON, for browser tests. */
  MAIL_OUTBOX_DIR: optionalString,
  MAIL_FROM: z.string().min(1).default('Codeqlick <hello@codeqlick.com>'),
  /**
   * Neoqlick's sender and its mailbox's SMTP login (architecture 4.18, Emails): `Neoqlick
   * <hello@neoqlick.com>`. Unset (the mailbox doesn't exist yet): Neoqlick's emails go out under
   * the display name Neoqlick with MAIL_FROM's address and SMTP login, and a warning says so.
   */
  MAIL_FROM_NEOQLICK: optionalString,
  SMTP_USER_NEOQLICK: optionalString,
  SMTP_PASSWORD_NEOQLICK: optionalString,
  LEADS_NOTIFY_TO: z.string().min(1).default('hello@codeqlick.com'),
  /** Folder for uploaded images; relative paths resolve against the working directory. */
  UPLOADS_DIR: z.string().min(1).default('./uploads'),
  /** Swipe's photos (architecture 4.10): private, never served by name, apart from UPLOADS_DIR. */
  SWIPE_UPLOADS_DIR: z.string().min(1).default('./swipe-uploads'),
  /** Cruising's photos and videos (architecture 4.15, phase 4): private, never served by name. */
  CRUISING_UPLOADS_DIR: z.string().min(1).default('./cruising-uploads'),
  /** Version of Cruising's rules, terms and privacy policy (architecture 4.15); a new value asks every member to accept again. */
  CRUISING_TERMS_VERSION: z.string().min(1).max(40).default('2026-11-17.1'),
  SEED_ADMIN_EMAIL: optionalString,
  SEED_ADMIN_PASSWORD: optionalString,
  SEED_ADMIN_NAME: optionalString,
  /** Admins must have two-step verification on to use the admin API (production: true). */
  ADMIN_TWO_FACTOR_REQUIRED: booleanString,
  /**
   * Passkeys' relying party (decision 104): a domain every host is under, so one passkey works on
   * the website and every app. Unset: `codeqlick.com` in production, `localhost` elsewhere.
   */
  WEBAUTHN_RP_ID: optionalString,
  /**
   * Pages passkeys may be used from, comma-separated. Unset: the website (SITE_URL), the account
   * host (ACCOUNT_URL) and the hosts of Codeqlick's web apps (see `AppConfigService.webauthnOrigins`).
   */
  WEBAUTHN_ORIGINS: optionalString,
  /** Neoqlick's passkey relying party (4.18). Unset: `neoqlick.com` in production, `localhost` elsewhere. */
  WEBAUTHN_RP_ID_NEOQLICK: optionalString,
  /** Pages passkeys may be used from on Neoqlick, comma-separated. Unset: its account host and apps. */
  WEBAUTHN_ORIGINS_NEOQLICK: optionalString,
  /** New passwords are refused when Have I Been Pwned lists them (production: true). */
  PASSWORD_BREACH_CHECK: booleanString,
  /** Umami (analytics) for the admin dashboard's visit numbers; unset: no visit numbers. */
  UMAMI_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.url().optional(),
  ),
  UMAMI_WEBSITE_ID: optionalString,
  UMAMI_USERNAME: z.string().min(1).default('admin'),
  UMAMI_PASSWORD: optionalString,
  /** The tracker managed client sites load (Umami's script, served by its public dashboard). */
  UMAMI_SCRIPT_URL: z.url().default('https://stats.codeqlick.com/script.js'),
  /** The site builder (codeqlick-sites/builder); unset: managed sites can't be built. */
  SITE_BUILDER_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.url().optional(),
  ),
  SITE_BUILDER_TOKEN: optionalString,
  /** Managed sites get a preview at <slug>.<this>. */
  SITES_PREVIEW_DOMAIN: z.string().min(3).default('demo.codeqlick.com'),
  /** Codeqlick Cloud's hosting domain (architecture 4.13): projects at <slug>.<this>; unset: no deploys. */
  CLOUD_HOSTING_DOMAIN: optionalString,
  /**
   * Exact domains under codeqlick.com that only the team with id CLOUD_PLATFORM_TEAM_ID may add as
   * custom domains (architecture 4.13), comma-separated; either empty: no exception.
   */
  CLOUD_PLATFORM_DOMAINS: optionalString,
  CLOUD_PLATFORM_TEAM_ID: optionalString,
  /** Where deployments, host links and domain files are written (/srv/codeqlick/cloud on the host). */
  CLOUD_ROOT: optionalString,
  /** Cloud's GitHub App (architecture 4.13, Builds from Git); builds from Git are off without them. */
  GITHUB_APP_ID: optionalString,
  GITHUB_APP_SLUG: optionalString,
  GITHUB_APP_CLIENT_ID: optionalString,
  GITHUB_APP_CLIENT_SECRET: optionalString,
  /** The PEM's contents, line breaks as \\n. */
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_APP_WEBHOOK_SECRET: optionalString,
  /** What Cloud's build server agent sends to claim and report builds (architecture 8.4). */
  CLOUD_BUILDER_TOKEN: optionalString,
  /** Managed databases (architecture 4.13 "Databases", decision 47): the cloud-pg administrator's
   * connection inside Docker, and the public host developers connect to. */
  CLOUD_PG_ADMIN_URL: optionalString,
  CLOUD_PG_HOST: optionalString,
  CLOUD_PG_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  /** Object storage (architecture 4.13 "Object storage", decision 48): Garage's admin API inside
   * Docker, its token, and the public S3 endpoint. */
  CLOUD_STORAGE_ADMIN_URL: optionalString,
  CLOUD_STORAGE_ADMIN_TOKEN: optionalString,
  CLOUD_STORAGE_ENDPOINT: optionalString,
  CLOUD_STORAGE_REGION: z.string().default('garage'),
  /** The capacity Garage's single node announces, in GB (its layout). */
  CLOUD_STORAGE_CAPACITY_GB: z.coerce.number().int().min(1).default(100),
  /** Disk guard (architecture 4.13 "Disk guard", decision 49): free space, in GB, under which
   * Cloud warns (low) and stops growing (full). */
  CLOUD_DISK_LOW_GB: z.coerce.number().min(0).default(30),
  CLOUD_DISK_MIN_GB: z.coerce.number().min(0).default(15),
  /** What the hosting sites' Nginx sends (`X-Cq-Protection-Key`) to /cloud/protection/*
   * (architecture 4.13 "Password protection"); unset: those routes answer 503. */
  CLOUD_PROTECTION_KEY: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(32).optional(),
  ),
  /** The Cloud console, for links in emails and the CLI's sign-in page. */
  CLOUD_URL: z.url().default('https://cloud.codeqlick.com'),
  /** The API as browsers reach it: the form of a managed site posts to <this>/forms/:key. */
  PUBLIC_API_URL: z.url().default('https://api.codeqlick.com/v1'),
  /** OVH's API (the team's account), for domain availability, DNS and expiry; unset: off. */
  OVH_ENDPOINT: z.url().default('https://eu.api.ovh.com/1.0'),
  OVH_APPLICATION_KEY: optionalString,
  OVH_APPLICATION_SECRET: optionalString,
  OVH_CONSUMER_KEY: optionalString,
  /** The team's OVH account ID, which clients make the technical contact of their domain. */
  OVH_NIC_HANDLE: optionalString,
  /** The server's public IPv4: managed sites' domains must point here (their A record). */
  SITES_SERVER_IP: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.ipv4().optional(),
  ),
  /** Buying a preview online (architecture 8.2, decision 20); unset: off. */
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  /** Codeqlick Cloud's PRO plan: a recurring monthly price in Stripe (decision 46). */
  STRIPE_CLOUD_PRO_PRICE_ID: optionalString,
  /** The managed sites' maintenance plan: a recurring monthly price in Stripe (decision 110). */
  STRIPE_MAINTENANCE_PRICE_ID: optionalString,
  /** Price of a basic website bought online, in euro cents before VAT. */
  SITE_PRICE_CENTS: z.coerce.number().int().min(100).max(1_000_000).default(20000),
  /** VAT added to it, in percent (Spain's general rate). */
  SITE_VAT_PERCENT: z.coerce.number().min(0).max(50).default(21),
  /** Pages allowed to open the video chat's WebSocket (its Origin header), comma-separated. */
  VIDEOCHAT_ORIGINS: z
    .string()
    .default('http://videochat.localhost:3000,http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter((origin) => origin.length > 0),
    ),
  /** Pages allowed to open the meetings' WebSocket (its Origin header), comma-separated. */
  MEETINGS_ORIGINS: z
    .string()
    .default('http://meetings.localhost:3000,http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter((origin) => origin.length > 0),
    ),
  /** Only people whose age was verified for real may use the video chat (off: declared 18+). */
  VIDEOCHAT_AGE_VERIFICATION_REQUIRED: booleanString,
  /** coturn's `static-auth-secret`: signs the video chat's short-lived TURN credentials. */
  TURN_SECRET: optionalString,
  /** STUN/TURN URLs given to browsers, comma-separated (stun:… and turn:…); unset: none. */
  TURN_URLS: optionalString,
  /** Web Push (VAPID) keys for the video chat's "someone is there" notifications; unset: off. */
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  /** Contact the push services may use (mailto: or https:). */
  VAPID_SUBJECT: z.string().default('mailto:hello@codeqlick.com'),
  /** Neoqlick's own VAPID pair and contact (4.18). Unset: the pair above is used for its pushes. */
  NEOQLICK_VAPID_PUBLIC_KEY: optionalString,
  NEOQLICK_VAPID_PRIVATE_KEY: optionalString,
  NEOQLICK_VAPID_SUBJECT: z.string().default('mailto:hello@neoqlick.com'),
  /** Version of the account terms a NEOQLICK sign-up accepts (4.18, Legal). */
  NEOQLICK_TERMS_VERSION: z.string().min(1).max(40).default('2026-11-17.1'),
  /**
   * Neoqlick's operator for its emails' footer (4.18, Legal): the trade name and the owner's data;
   * each falls back to `LEGAL_OWNER_*` (the website's legal holder) while unset.
   */
  NEOQLICK_TRADE_NAME: optionalString,
  NEOQLICK_LEGAL_OWNER_NAME: optionalString,
  NEOQLICK_LEGAL_OWNER_TAX_ID: optionalString,
  NEOQLICK_LEGAL_OWNER_ADDRESS: optionalString,
  LEGAL_OWNER_NAME: optionalString,
  LEGAL_OWNER_TAX_ID: optionalString,
  LEGAL_OWNER_ADDRESS: optionalString,
  /** Neoqlick's website id in the same Umami (read by the website; listed here for the template). */
  NEOQLICK_UMAMI_WEBSITE_ID: optionalString,
  /** Cloudflare Turnstile's secret key: sign-up and sign-in need a valid token; unset: off. */
  TURNSTILE_SECRET_KEY: optionalString,
  PAGESPEED_API_KEY: optionalString,
  /** Tells search engines about changed posts and case studies (architecture 4.1, IndexNow). */
  INDEXNOW_ENABLED: booleanString,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule.forRoot({ validate }). Throws (and aborts boot) on invalid config. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
