import { z } from 'zod';

export const linksQuerySchema = z.object({
  status: z.enum(['broken', 'all']).default('broken'),
});
export type LinksQuery = z.infer<typeof linksQuerySchema>;
