import { z } from 'zod';

export const timelineQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
