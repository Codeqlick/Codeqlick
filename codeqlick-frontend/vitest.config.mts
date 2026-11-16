import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for code that runs without Next.js: helpers, schemas and plain components.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next.js resolves it to an empty module on the server; outside Next.js it throws.
      'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // next-intl's middleware imports `next/server` without an extension: let Vite resolve it (the
    // proxy's tests).
    server: { deps: { inline: ['next-intl'] } },
  },
});
