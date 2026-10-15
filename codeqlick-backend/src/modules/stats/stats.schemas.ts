import { z } from 'zod';

export const timelineQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export const visitsQuerySchema = z.object({
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
    .default(30),
});
export type VisitsQuery = z.infer<typeof visitsQuerySchema>;
