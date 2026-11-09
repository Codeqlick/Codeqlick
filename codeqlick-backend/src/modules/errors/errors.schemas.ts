import { z } from 'zod';

/** What the website reports (POST /errors): its server's errors and its visitors' browsers'. */
export const reportErrorSchema = z
  .object({
    source: z.enum(['server', 'browser']),
    message: z.string().trim().min(1).max(2000),
    stack: z.string().max(20_000).optional(),
    method: z.string().trim().max(10).optional(),
    path: z.string().trim().max(2000).optional(),
    /** Next.js's digest of a server error, to find it in the web container's logs. */
    digest: z.string().trim().max(100).optional(),
    userAgent: z.string().max(1000).optional(),
  })
  .strict();
export type ReportErrorInput = z.infer<typeof reportErrorSchema>;

export const errorsQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).default('open'),
});
export type ErrorsQuery = z.infer<typeof errorsQuerySchema>;
