import 'server-only';
import { cookies, headers as requestHeaders } from 'next/headers';
import { env } from '@/lib/env';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import { clientHeaders } from '@/lib/auth/refresh';
import { ApiError } from './errors';
import type { ProblemDetails } from './types';

export type AuthMode = 'required' | 'optional' | 'none';

export type QueryValue = string | number | boolean | null | undefined;

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON-encoded when present; a FormData is sent as multipart (file uploads). */
  body?: unknown;
  /** Query string params; null/undefined/'' values are skipped. */
  query?: Record<string, QueryValue>;
  /**
   * `required`: send `Authorization: Bearer <cq_at>`; throws ApiError(401) without calling the API
   * when there is no token. `optional`: send it if present. `none` (default): never read cookies,
   * so public pages stay cacheable.
   */
  auth?: AuthMode;
  /** Explicit access token (e.g. right after login, before the cookie exists). */
  token?: string;
  /**
   * Sends the visitor's IP as `X-Forwarded-For` so the API rate-limits per visitor instead of
   * per web server (it trusts one proxy hop), and their `User-Agent`, which the API records on new
   * sessions. Reads request headers: Server Actions only.
   */
  forwardClientIp?: boolean;
  /** Fetch cache mode. Defaults to `no-store` for authenticated calls. */
  cache?: RequestCache;
  /** ISR revalidation in seconds for public content (section 6.2: 300). */
  revalidate?: number | false;
  /** `text` returns the body as a string instead of parsing JSON (e.g. CSV downloads). */
  responseType?: 'json' | 'text';
  /** Aborts the request; defaults to a 10 s timeout so a slow API can't hang a render or build. */
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function readAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value || undefined;
}

async function parseProblem(response: Response): Promise<ProblemDetails> {
  try {
    const text = await response.text();
    if (!text) return { status: response.status, title: response.statusText };
    const data: unknown = JSON.parse(text);
    if (data && typeof data === 'object') return data as ProblemDetails;
  } catch {
    // Not JSON (e.g. an HTML error page from a proxy): fall through.
  }
  return { status: response.status, title: response.statusText };
}

/**
 * Typed server-to-server call to the Codeqlick API (BFF pattern: the browser never calls it).
 * Throws ApiError for non-2xx responses and network failures. Returns `undefined` for 204.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = 'none', signal } = options;

  const headers = new Headers({ Accept: 'application/json, application/problem+json' });

  let token = options.token;
  if (!token && auth !== 'none') token = await readAccessToken();
  if (!token && auth === 'required') {
    throw new ApiError(401, { title: 'Unauthorized', detail: 'Not signed in' });
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  // fetch sets the multipart Content-Type (with its boundary) itself.
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers.set('Content-Type', 'application/json');

  if (options.forwardClientIp) {
    for (const [name, value] of Object.entries(clientHeaders(await requestHeaders()))) {
      headers.set(name, value);
    }
  }

  const init: RequestInit = {
    method,
    headers,
    body: body === undefined || isForm ? body : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  };

  if (options.revalidate !== undefined && !token) {
    init.next = { revalidate: options.revalidate };
  } else {
    init.cache = options.cache ?? (token || method !== 'GET' ? 'no-store' : 'default');
  }

  const url = `${env.API_URL}${path.startsWith('/') ? path : `/${path}`}${buildQuery(query)}`;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new ApiError(503, {
      title: 'Service Unavailable',
      detail: error instanceof Error ? `API unreachable: ${error.message}` : 'API unreachable',
    });
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseProblem(response));
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (options.responseType === 'text') return text as T;
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
