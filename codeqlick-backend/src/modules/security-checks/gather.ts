import { safeFetch, type FetchedPage, type FetchOptions } from '../../common/safe-fetch.js';
import { createDnsClient, readDns, type DnsClient } from './dns-lookup.js';
import type { RetireRepository } from './retire.js';
import type { SecurityInputs, TlsInputs, WebInputs } from './security-check-inputs.js';
import { probeTls } from './tls-probe.js';

export const USER_AGENT = 'Codeqlick-SecurityCheck/1.0 (+https://codeqlick.com/security-check)';

/** The domain doesn't exist (no record of any kind): the check can't go on. */
export class DomainNotFoundError extends Error {}

/** Everything the reading does to the network; replaced in tests. */
export interface Probes {
  fetch(url: string, options?: FetchOptions): Promise<FetchedPage>;
  tls(domain: string): Promise<TlsInputs | null>;
  dns: DnsClient;
}

export function networkProbes(): Probes {
  return {
    fetch: (url, options) => safeFetch(url, { userAgent: USER_AGENT, ...options }),
    tls: (domain) => probeTls(domain),
    dns: createDnsClient(),
  };
}

/** TLS errors that mean the certificate itself is wrong (the page is then read without checking it). */
const CERTIFICATE_ERRORS =
  /CERT_|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ERR_TLS_CERT_ALTNAME|DEPTH_ZERO|EXPIRED/;

function codeOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof code === 'string') return code;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

const toPage = (page: FetchedPage) => ({
  url: page.url,
  status: page.status,
  headers: page.headers,
  body: page.body,
});

/** A small text file, or null when it isn't there (a page that answers every path isn't it). */
async function textFile(
  probes: Probes,
  url: string,
  options: FetchOptions = {},
): Promise<string | null> {
  try {
    const file = await probes.fetch(url, { timeoutMs: 10_000, maxBytes: 128 * 1024, ...options });
    if (file.status !== 200) return null;
    if (/text\/html/i.test(String(file.headers['content-type'] ?? ''))) return null;
    return file.body;
  } catch {
    return null;
  }
}

async function readWeb(domain: string, probes: Probes): Promise<WebInputs> {
  const homepage = async (): Promise<{ page: WebInputs['page']; certificateFailed: boolean }> => {
    try {
      return { page: toPage(await probes.fetch(`https://${domain}/`)), certificateFailed: false };
    } catch (error) {
      if (!CERTIFICATE_ERRORS.test(codeOf(error))) return { page: null, certificateFailed: false };
    }
    // The certificate is wrong: still read the page for the other checks.
    try {
      const page = await probes.fetch(`https://${domain}/`, { insecure: true });
      return { page: toPage(page), certificateFailed: true };
    } catch {
      return { page: null, certificateFailed: true };
    }
  };
  const plain = async (): Promise<WebInputs['http']> => {
    try {
      const page = await probes.fetch(`http://${domain}/`, { maxBytes: 64 * 1024 });
      return { finalUrl: page.url, firstRedirect: page.redirects[0] ?? null, status: page.status };
    } catch {
      return null;
    }
  };
  const [home, http, tls, securityTxt] = await Promise.all([
    homepage(),
    plain(),
    probes.tls(domain).catch(() => null),
    textFile(probes, `https://${domain}/.well-known/security.txt`),
  ]);
  return { ...home, http, tls, securityTxt };
}

/**
 * Reads what the checks need (architecture 4.19): the homepage, `security.txt`, the three TLS
 * handshakes, the DNS records and the MTA-STS policy. Throws `DomainNotFoundError` for a name
 * with no records at all.
 */
export async function gatherInputs(
  domain: string,
  retire: RetireRepository | null,
  probes: Probes = networkProbes(),
): Promise<SecurityInputs> {
  const [web, dns, exists] = await Promise.all([
    readWeb(domain, probes),
    readDns(domain, probes.dns, (name) =>
      textFile(probes, `https://mta-sts.${name}/.well-known/mta-sts.txt`, { maxRedirects: 0 }),
    ),
    probes.dns.exists(domain),
  ]);
  if (exists === false) throw new DomainNotFoundError('Domain not found');
  return { domain, now: new Date(), web, dns, retire };
}
