import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// Architecture 4.13 "Public documentation". Static output, one folder per page
// (`/en/quickstart/` is `dist/en/quickstart/index.html`).
export default defineConfig({
  site: 'https://docs.codeqlick.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    // Draft pages have no route, so they never reach the sitemap.
    sitemap({ i18n: { defaultLocale: 'en', locales: { en: 'en', es: 'es' } } }),
  ],
});
