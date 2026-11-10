import type { AuditInputs } from './site-audit-checks.js';
import { sitemapsIn } from './site-audit-checks.js';
import { safeFetch, type FetchedPage } from './safe-fetch.js';

/** TLS errors that mean the certificate itself is wrong (the page is then read without checking it). */
const CERTIFICATE_ERRORS =
  /CERT_|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ERR_TLS_CERT_ALTNAME|DEPTH_ZERO/;

function codeOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof code === 'string') return code;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

/** A small text file at `path` of `origin`, or null when it isn't there. */
async function textFile(origin: string, path: string): Promise<string | null> {
  try {
    const file = await safeFetch(new URL(path, origin).toString(), {
      timeoutMs: 10_000,
      maxBytes: 512 * 1024,
    });
    if (file.status !== 200) return null;
    const type = String(file.headers['content-type'] ?? '');
    // Sites that answer every path with their home page don't have the file.
    if (/text\/html/i.test(type)) return null;
    return file.body;
  } catch {
    return null;
  }
}

/** Google PageSpeed Insights (mobile, performance only), or null when off or failing. */
export async function pageSpeed(
  url: string,
  apiKey: string | undefined,
): Promise<AuditInputs['pageSpeed']> {
  if (!apiKey) return null;
  try {
    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', 'mobile');
    endpoint.searchParams.set('category', 'performance');
    endpoint.searchParams.set('key', apiKey);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number | null } };
        audits?: { 'largest-contentful-paint'?: { numericValue?: number } };
      };
    };
    const score = data.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== 'number') return null;
    const lcp = data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue;
    return { performance: score * 100, lcpMs: typeof lcp === 'number' ? lcp : null };
  } catch {
    return null;
  }
}

/**
 * Everything the checks need: the page (an invalid certificate is noted and the page read anyway),
 * how plain http answers, robots.txt, the sitemap and, with a key, PageSpeed Insights. Throws when
 * the page can't be read; the error's message says why (a code such as `ENOTFOUND`, or `HTTP 404`).
 */
export async function gather(url: string, pageSpeedKey?: string): Promise<AuditInputs> {
  let certificate: AuditInputs['certificate'] = null;
  let page: FetchedPage;
  try {
    page = await safeFetch(url);
  } catch (error) {
    const code = codeOf(error);
    if (!CERTIFICATE_ERRORS.test(code)) throw new Error(code, { cause: error });
    certificate = { validTo: null, error: code };
    page = await safeFetch(url, { insecure: true }).catch((retry: unknown) => {
      throw new Error(codeOf(retry), { cause: retry });
    });
  }
  if (page.status >= 400) throw new Error(`HTTP ${page.status}`);
  const type = String(page.headers['content-type'] ?? 'text/html');
  if (!/html/i.test(type)) throw new Error('The address is not HTML');

  const final = new URL(page.url);
  if (final.protocol === 'https:' && !certificate) {
    certificate = { validTo: page.certificateValidTo, error: null };
  }

  const [httpVersion, robotsTxt, speed] = await Promise.all([
    final.protocol === 'https:'
      ? safeFetch(`http://${final.host}/`, {
          maxRedirects: 0,
          timeoutMs: 10_000,
          maxBytes: 64 * 1024,
        })
          .then((answer) =>
            answer.status >= 300 &&
            answer.status < 400 &&
            /^https:/i.test(String(answer.headers.location ?? ''))
              ? ('https' as const)
              : answer.status < 300
                ? ('http' as const)
                : ('none' as const),
          )
          .catch(() => 'none' as const)
      : Promise.resolve(null),
    textFile(final.origin, '/robots.txt'),
    pageSpeed(page.url, pageSpeedKey),
  ]);

  let sitemapFound = false;
  const listed = robotsTxt ? sitemapsIn(robotsTxt) : [];
  for (const candidate of [...listed.slice(0, 2), '/sitemap.xml', '/sitemap_index.xml']) {
    const body = await textFile(final.origin, candidate).catch(() => null);
    if (body && /<(urlset|sitemapindex)\b/i.test(body)) {
      sitemapFound = true;
      break;
    }
  }

  return {
    page: {
      url: page.url,
      status: page.status,
      headers: page.headers,
      body: page.body,
      bytes: page.bytes,
      ttfbMs: page.ttfbMs,
    },
    certificate,
    httpVersion,
    robotsTxt,
    sitemapFound,
    pageSpeed: speed,
    now: new Date(),
  };
}
