import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (instead of esbuild) so decorator metadata is emitted, which Nest's DI relies on.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
});
