/** Longest stored file name, in characters (the extension is kept when shortening). */
export const MAX_FILE_NAME_LENGTH = 200;

/**
 * Turns the name the browser sent into one that is safe to store and to put back in a
 * Content-Disposition header: no folders, no control or quote characters, bounded length.
 */
export function cleanFileName(raw: string | undefined): string {
  const base = (raw ?? '').split(/[/\\]/).at(-1) ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}"<>|:*?]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (!cleaned) return 'file';
  if (cleaned.length <= MAX_FILE_NAME_LENGTH) return cleaned;

  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, MAX_FILE_NAME_LENGTH - extension.length).trimEnd() + extension;
}

/** `type/subtype` as sent by the browser, or the generic binary type when it looks wrong. */
export function cleanContentType(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase();
  return /^[a-z0-9][\w.+-]{0,63}\/[a-z0-9][\w.+-]{0,127}$/.test(value)
    ? value
    : 'application/octet-stream';
}

/**
 * `Content-Disposition: attachment` with an ASCII fallback name and the exact UTF-8 name
 * (RFC 6266 / RFC 5987), so accents survive in every browser.
 */
export function attachmentDisposition(name: string): string {
  const ascii =
    name
      .normalize('NFD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\]/g, '') || 'file';
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
