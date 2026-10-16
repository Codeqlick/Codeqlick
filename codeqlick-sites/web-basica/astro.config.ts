import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

/**
 * The folder with the site's content: `site/`, or `SITE_DIR` (e.g. `examples/peluqueria`, or an
 * absolute path: the site builder writes each managed site's content to a work folder).
 */
const siteDir =
  resolve(fileURLToPath(new URL('.', import.meta.url)), process.env.SITE_DIR ?? 'site') + '/';
const { default: content } = (await import(pathToFileURL(`${siteDir}site.ts`).href)) as {
  default: { url: string };
};

export default defineConfig({
  site: process.env.SITE_URL ?? content.url,
  trailingSlash: 'never',
  build: { format: 'file' },
  // Legal pages are noindex: keep them out of the sitemap.
  integrations: [sitemap({ filter: (page) => !/\/(aviso-legal|privacidad|cookies)$/.test(page) })],
  vite: {
    resolve: { alias: { '@site': siteDir.replace(/\/$/, '') } },
  },
});
