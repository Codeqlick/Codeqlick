import { z } from 'zod';

export const createTimeEntrySchema = z
  .object({
    /** `yyyy-mm-dd`: the day the work was done. */
    date: z.iso.date(),
    /** 1 minute to 24 hours. */
    minutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    description: z.string().trim().min(1).max(500),
  })
  .strict();
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

export const timeEntryParamSchema = z.object({ id: z.uuid(), entryId: z.uuid() });
export type TimeEntryParam = z.infer<typeof timeEntryParamSchema>;

export const timeMonthQuerySchema = z.object({
  /** `yyyy-mm`; the current Madrid month when left out. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type TimeMonthQuery = z.infer<typeof timeMonthQuerySchema>;

/** A project's monthly hour allowance (maintenance plan). */
export const planSchema = z
  .object({
    active: z.boolean(),
    name: z.string().trim().min(1).max(120),
    /** 1 hour to 1000 hours a month. */
    monthlyMinutes: z.number().int().min(60).max(60_000),
    alertPercent: z.number().int().min(10).max(99).default(80),
  })
  .strict();
export type PlanInput = z.infer<typeof planSchema>;
