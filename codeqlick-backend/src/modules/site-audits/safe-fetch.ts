import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

export const USER_AGENT = 'Codeqlick-WebsiteCheck/1.0 (+https://codeqlick.com/website-check)';

/** The address can't be checked: not http(s), another port, credentials, or a private network. */
export class UnsafeUrlError extends Error {
  readonly code = 'UNSAFE_URL';
}

/**
 * Addresses a website check must never connect to (architecture 4.12): private, loopback,
 * link-local, shared, documentation, multicast and reserved ranges. IPv6 is allowed only in global
 * unicast (2000::/3) minus its special blocks, which also rules out IPv4-mapped and NAT64 forms.
 */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet('2000::', 3, 'ipv6');
const SPECIAL_V6 = new BlockList();
for (const [network, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  SPECIAL_V6.addSubnet(network, prefix, 'ipv6');
}

/** True for an address anyone on the internet can reach. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !BLOCKED.check(address, 'ipv4');
  if (family === 6) return GLOBAL_V6.check(address, 'ipv6') && !SPECIAL_V6.check(address, 'ipv6');
  return false;
}

/** Throws unless `url` is http(s) on its default port, without credentials. */
export function assertCheckableUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https addresses');
  }
  if (url.username || url.password) throw new UnsafeUrlError('No credentials in the address');
  if (url.port !== '') throw new UnsafeUrlError('Only the standard ports');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) throw new UnsafeUrlError('Private address');
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * DNS lookup for the request itself: every address the name resolves to must be public, and the
 * connection uses one of them, so no second lookup can point it somewhere else.
 */
function safeLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback): void {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    if (addresses.length === 0 || !addresses.every((entry) => isPublicAddress(entry.address))) {
      return callback(new UnsafeUrlError('The name points to a private address'), '');
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Most bytes of the (decompressed) body read; the rest is dropped and `truncated` set. */
  maxBytes?: number;
  maxRedirects?: number;
  /** Accept an invalid certificate (to still look at a site whose certificate failed). */
  insecure?: boolean;
}

export interface FetchedPage {
  /** The URL that answered, after redirects. */
  url: string;
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
  /** Bytes of the decompressed body read. */
  bytes: number;
  truncated: boolean;
  /** From sending the last request to its headers. */
  ttfbMs: number;
  /** The redirects followed, in order (each a Location as resolved). */
  redirects: string[];
  /** The certificate's expiry for an https answer. */
  certificateValidTo: Date | null;
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  bytes: number;
  truncated: boolean;
  ttfbMs: number;
  certificateValidTo: Date | null;
}

function decoded(response: IncomingMessage): NodeJS.ReadableStream {
  const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return response.pipe(createGunzip());
  if (encoding === 'br') return response.pipe(createBrotliDecompress());
  if (encoding === 'deflate') return response.pipe(createInflate());
  return response;
}

function once(url: URL, options: Required<FetchOptions>): Promise<RawResponse> {
  assertCheckableUrl(url);
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const deadline = setTimeout(() => {
      request.destroy(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' }));
    }, options.timeoutMs);
    const fail = (error: Error) => {
      clearTimeout(deadline);
      reject(error);
    };
    const request = send(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: safeLookup as never,
        rejectUnauthorized: !options.insecure,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Encoding': 'gzip, br, deflate',
          'Accept-Language': 'es,en;q=0.8',
        },
      },
      (response) => {
        const ttfbMs = Date.now() - started;
        const socket = response.socket as TLSSocket;
        const validTo =
          url.protocol === 'https:' && typeof socket.getPeerCertificate === 'function'
            ? socket.getPeerCertificate()?.valid_to
            : undefined;
        const chunks: Buffer[] = [];
        let bytes = 0;
        let truncated = false;
        const stream = decoded(response);
        const finish = () => {
          clearTimeout(deadline);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
            bytes,
            truncated,
            ttfbMs,
            certificateValidTo: validTo ? new Date(validTo) : null,
          });
        };
        stream.on('data', (chunk: Buffer) => {
          if (truncated) return;
          bytes += chunk.length;
          if (bytes > options.maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (bytes - options.maxBytes)));
            bytes = options.maxBytes;
            response.destroy();
            finish();
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', finish);
        stream.on('error', (error: Error) => (truncated ? undefined : fail(error)));
      },
    );
    request.on('error', fail);
    request.end();
  });
}

/**
 * GET `url` the safe way (architecture 4.12): public addresses only, checked on every connection
 * and every redirect; a time limit and a size limit. Redirects are followed up to `maxRedirects`
 * (0: the first answer is returned as is).
 */
export async function safeFetch(input: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const settings: Required<FetchOptions> = {
    timeoutMs: options.timeoutMs ?? 15_000,
    maxBytes: options.maxBytes ?? 3 * 1024 * 1024,
    maxRedirects: options.maxRedirects ?? 5,
    insecure: options.insecure ?? false,
  };
  let url = new URL(input);
  const redirects: string[] = [];
  for (;;) {
    const response = await once(url, settings);
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirects.length >= settings.maxRedirects) {
        if (settings.maxRedirects === 0) return toPage(url, response, redirects);
        throw Object.assign(new Error('Too many redirects'), { code: 'TOO_MANY_REDIRECTS' });
      }
      url = new URL(location, url);
      redirects.push(url.toString());
      continue;
    }
    return toPage(url, response, redirects);
  }
}

function toPage(url: URL, response: RawResponse, redirects: string[]): FetchedPage {
  return {
    url: url.toString(),
    status: response.status,
    headers: response.headers,
    body: response.body.toString('utf8'),
    bytes: response.bytes,
    truncated: response.truncated,
    ttfbMs: response.ttfbMs,
    redirects,
    certificateValidTo: response.certificateValidTo,
  };
}
