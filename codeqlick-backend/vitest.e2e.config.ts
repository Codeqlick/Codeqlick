import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end tests boot the real AppModule against a PostgreSQL database that already has
// the migrations applied (`npx prisma migrate deploy`). CI provides one as a service.
const env = (name: string, fallback: string): string => process.env[name] ?? fallback;

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: env(
        'DATABASE_URL',
        'postgresql://codeqlick:codeqlick@localhost:5432/codeqlick',
      ),
      JWT_ACCESS_SECRET: env(
        'JWT_ACCESS_SECRET',
        'e2e-secret-e2e-secret-e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      ),
      JWT_ACCESS_TTL: env('JWT_ACCESS_TTL', '900'),
      REFRESH_TOKEN_TTL_DAYS: env('REFRESH_TOKEN_TTL_DAYS', '30'),
      CORS_ORIGINS: env('CORS_ORIGINS', 'http://localhost:3000'),
      SMTP_HOST: env('SMTP_HOST', 'localhost'),
      SMTP_PORT: env('SMTP_PORT', '1025'),
      SMTP_SECURE: env('SMTP_SECURE', 'false'),
      MAIL_FROM: env('MAIL_FROM', 'Codeqlick <hello@codeqlick.com>'),
      LEADS_NOTIFY_TO: env('LEADS_NOTIFY_TO', 'hello@codeqlick.com'),
      LOG_LEVEL: env('LOG_LEVEL', 'silent'),
    },
  },
});
