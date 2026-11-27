import { BadRequestException, ConflictException } from '@nestjs/common';
import { RESERVED_USERNAMES, USERNAME_PATTERN } from './auth.schemas.js';

export type UsernameProblem = 'invalid' | 'reserved' | 'taken';

/** Without a leading @ or surrounding spaces, capitals kept (how usernames are typed and stored). */
export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '');
}

/**
 * The form two usernames are compared in. Capitals are ignored, so nobody can pass for someone
 * else by changing a letter's case ("Ana", "ana" and "ANA" are one name).
 */
export function usernameKey(username: string): string {
  return username.toLowerCase();
}

/** The columns that store a username: as chosen, and the lower-cased key its unique index holds. */
export function usernameColumns(username: string | null): {
  username: string | null;
  usernameLower: string | null;
} {
  return { username, usernameLower: username === null ? null : usernameKey(username) };
}

/** Whether the name is one nobody but the team may take, in any capitals and ignoring `.`/`_`. */
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(usernameKey(username).replace(/[._]/g, ''));
}

/**
 * What the rules alone say about a username (not whether it is taken): `invalid` when it breaks
 * the pattern, `reserved` when it is reserved and the account is not the team's.
 */
export function usernameRuleProblem(
  username: string,
  mayUseReserved = false,
): 'invalid' | 'reserved' | null {
  if (!USERNAME_PATTERN.test(username)) return 'invalid';
  if (!mayUseReserved && isReservedUsername(username)) return 'reserved';
  return null;
}

/** The field error for a username that can't be used: 409 when taken, 400 otherwise. */
export function usernameError(
  problem: UsernameProblem,
  field = 'username',
): BadRequestException | ConflictException {
  const errors = [{ path: field, message: problem }];
  return problem === 'taken'
    ? new ConflictException({ detail: 'This username is taken', errors })
    : new BadRequestException({ detail: `Username ${problem}`, errors });
}
