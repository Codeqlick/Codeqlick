import { reportCspViolations } from '@/lib/api/error-reports';

/** Larger bodies are not reports: a browser sends one violation, or a few in a list. */
const MAX_BYTES = 64 * 1024;
const TYPES = ['application/csp-report', 'application/reports+json', 'application/json'];

/**
 * Where browsers report what the Content Security Policy blocked, or would block while it is
 * report-only (`report-uri` and `report-to`, architecture 6.4). Same origin, so the browser never
 * calls the API (BFF); the report goes on as JSON and the API keeps it (4.11). Always 204: a
 * browser does nothing with the answer, and a failure here must never show anywhere.
 */
export async function POST(request: Request): Promise<Response> {
  const done = () => new Response(null, { status: 204 });
  const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (!type || !TYPES.includes(type)) return done();
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return done();
  const text = await readLimited(request, MAX_BYTES);
  if (!text) return done();
  let report: unknown;
  try {
    report = JSON.parse(text);
  } catch {
    return done();
  }
  try {
    await reportCspViolations(report);
  } catch {
    // Rate limited, refused or the API down: nothing to tell the browser.
  }
  return done();
}

/** The body as text, or null past `limit` bytes (read no further). */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
