/** File names the API generates for uploads; anything else is not one of our images. */
export const MEDIA_FILENAME = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|jpg|webp|gif)$/;

/**
 * The site-relative path (`/media/<file>`) of an image uploaded from the admin panel, or null for
 * any other URL. Only our own uploads go through the Next.js image optimizer; covers can also be
 * arbitrary remote URLs, which are shown as they are.
 */
export function localMediaPath(url: string, siteUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, siteUrl);
  } catch {
    return null;
  }
  if (parsed.origin !== new URL(siteUrl).origin || parsed.search || parsed.hash) return null;
  const match = /^\/media\/([^/]+)$/.exec(parsed.pathname);
  return match && MEDIA_FILENAME.test(match[1]) ? parsed.pathname : null;
}
