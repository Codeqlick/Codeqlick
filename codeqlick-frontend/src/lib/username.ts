/**
 * Same rules as the API: 3–20 letters of either case, digits, `.` and `_`, a letter or digit at
 * both ends, no `..`. Capitals are kept; the API compares usernames ignoring them.
 */
export const USERNAME_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._]{1,18}[A-Za-z0-9]$/;

/** A username as typed, without a leading @ or the spaces around it; capitals kept. */
export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '');
}

/** Whether the username follows the rules (whether it is free or reserved is the API's call). */
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** Why the API refused a username, from its field error: `invalid`, `reserved` or `taken`. */
export type UsernameReason = 'invalid' | 'reserved' | 'taken';

export function usernameReason(message: string | undefined): UsernameReason | null {
  return message === 'invalid' || message === 'reserved' || message === 'taken' ? message : null;
}
