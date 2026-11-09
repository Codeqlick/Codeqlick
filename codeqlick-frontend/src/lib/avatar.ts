/** File names the API gives profile photos. */
export const AVATAR_FILE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$/;

/** Where the website serves a profile photo, or null when there is none (or it isn't one). */
export function avatarPath(file: string | null | undefined): string | null {
  return file && AVATAR_FILE.test(file) ? `/avatar/${file}` : null;
}

/** Up to two initials of a name, for when there is no photo. */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}
