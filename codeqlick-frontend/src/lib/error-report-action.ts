'use server';

import { z } from 'zod';
import { reportError } from '@/lib/api/error-reports';
import { isBrowserNoise, pathOnly } from '@/lib/error-report';

const browserErrorSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(20_000).optional(),
  path: z.string().max(2000),
});

/**
 * A visitor's browser hit an error no page handled (architecture 4.11): it goes to Admin → Errors
 * through the BFF. Never throws, so a broken page can't break further for reporting.
 */
export async function reportBrowserErrorAction(input: unknown): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  const parsed = browserErrorSchema.safeParse(input);
  if (!parsed.success || isBrowserNoise(parsed.data.message, parsed.data.stack)) return;
  try {
    await reportError({
      source: 'browser',
      message: parsed.data.message,
      stack: parsed.data.stack,
      path: pathOnly(parsed.data.path),
    });
  } catch {
    // Rate limited or the API is down: nothing to do.
  }
}
