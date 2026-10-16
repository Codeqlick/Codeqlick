import { connect } from 'node:tls';

export type ProbeResult = {
  ok: boolean;
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
};

/** One request to the site: up when it answers below 400 within the timeout (redirects followed). */
export async function probe(url: string, timeoutMs = 15_000): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Codeqlick-Monitor/1.0 (+https://codeqlick.com)' },
    });
    // Reading the body frees the connection.
    await response.arrayBuffer().catch(() => undefined);
    const ok = response.status < 400;
    return {
      ok,
      statusCode: response.status,
      responseMs: Date.now() - started,
      error: ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `No answer in ${Math.round(timeoutMs / 1000)} s`
        : error instanceof Error
          ? ((error.cause as Error | undefined)?.message ?? error.message)
          : String(error);
    return { ok: false, statusCode: null, responseMs: null, error: reason.slice(0, 300) };
  }
}

/** When the site's TLS certificate expires; null for http:// or when it can't be read. */
export function certificateExpiry(url: string, timeoutMs = 10_000): Promise<Date | null> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = connect({
      host: parsed.hostname,
      port: Number(parsed.port) || 443,
      servername: parsed.hostname,
      timeout: timeoutMs,
    });
    const done = (value: Date | null) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('secureConnect', () => {
      const validTo = socket.getPeerCertificate()?.valid_to;
      done(validTo ? new Date(validTo) : null);
    });
    socket.once('error', () => done(null));
    socket.once('timeout', () => done(null));
  });
}
