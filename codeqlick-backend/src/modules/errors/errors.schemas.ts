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

const text = (max: number) => z.string().max(max).optional().catch(undefined);
const number = z.number().int().nonnegative().optional().catch(undefined);

/** `report-uri`'s body (CSP level 2): `{ "csp-report": { … } }`, hyphenated keys. */
const legacyCspReportSchema = z.object({
  'csp-report': z.object({
    'document-uri': text(2000),
    'violated-directive': text(500),
    'effective-directive': text(100),
    'blocked-uri': text(2000),
    'source-file': text(2000),
    'line-number': number,
    'column-number': number,
    'script-sample': text(500),
    disposition: text(20),
  }),
});

/** One item of the Reporting API's list (`report-to`); only `csp-violation` items are read. */
const reportingItemSchema = z.object({
  type: z.string().max(50),
  user_agent: text(1000),
  body: z
    .object({
      documentURL: text(2000),
      effectiveDirective: text(100),
      blockedURL: text(2000),
      sourceFile: text(2000),
      lineNumber: number,
      columnNumber: number,
      sample: text(500),
      disposition: text(20),
    })
    .optional()
    .catch(undefined),
});

/** What browsers report about the website's Content Security Policy (architecture 4.11). */
export const cspReportSchema = z.union([
  legacyCspReportSchema,
  z.array(reportingItemSchema).min(1).max(20),
]);
export type CspReportInput = z.infer<typeof cspReportSchema>;

export const errorsQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).default('open'),
});
export type ErrorsQuery = z.infer<typeof errorsQuerySchema>;
