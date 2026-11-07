/** `https://example.com` of a URL, or null if it isn't an http(s) URL. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** Origins a project's form accepts posts from: its production and staging addresses. */
export function allowedOrigins(urls: Array<string | null>): string[] {
  return [...new Set(urls.map(originOf).filter((origin) => origin !== null))];
}

/**
 * Where to send the visitor back after a post: the form's `redirect`, else the page it was sent
 * from, as long as it is on the site; with `form=ok` or `form=error` added. Null when neither is.
 */
export function returnUrl(
  candidates: Array<string | undefined>,
  allowed: string[],
  result: 'ok' | 'error',
): string | null {
  for (const candidate of candidates) {
    const origin = originOf(candidate);
    if (!candidate || !origin || !allowed.includes(origin)) continue;
    const url = new URL(candidate);
    url.searchParams.set('form', result);
    return url.toString();
  }
  return null;
}
