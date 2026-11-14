import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Pages live in `src/content/docs/<lang>/<slug>.md`, the same slugs in `en` and `es`.
 * Unknown frontmatter keys are an error, so a typo doesn't silently drop a page from the sidebar.
 */
const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.strictObject({
    title: z.string().min(1),
    description: z.string().min(1).max(160),
    group: z.enum(['start', 'hosting', 'services', 'reference']),
    order: z.number(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { docs };
