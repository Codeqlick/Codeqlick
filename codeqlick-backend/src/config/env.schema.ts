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
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  SMTP_SECURE: booleanString,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().min(1).default('Codeqlick <hello@codeqlick.com>'),
  LEADS_NOTIFY_TO: z.string().min(1).default('hello@codeqlick.com'),
  /** Folder for uploaded images; relative paths resolve against the working directory. */
  UPLOADS_DIR: z.string().min(1).default('./uploads'),
  SEED_ADMIN_EMAIL: optionalString,
  SEED_ADMIN_PASSWORD: optionalString,
  SEED_ADMIN_NAME: optionalString,
  /** Umami (analytics) for the admin dashboard's visit numbers; unset: no visit numbers. */
  UMAMI_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.url().optional(),
  ),
  UMAMI_WEBSITE_ID: optionalString,
  UMAMI_USERNAME: z.string().min(1).default('admin'),
  UMAMI_PASSWORD: optionalString,
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
