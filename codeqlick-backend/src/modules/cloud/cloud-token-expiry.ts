import type { TokenExpiryRow } from './cloud-tokens.repository.js';

/** Tokens expiring within this many days get one warning. */
export const WARN_DAYS = 7;
/** A token is worth a warning when it was used or created within this many days. */
export const ACTIVE_DAYS = 30;
/** An expired token is announced when it was used within this many days. */
export const EXPIRED_USED_DAYS = 7;

/** The rows of each person together (in order of first appearance), keyed by their id. */
export function groupByUser(rows: TokenExpiryRow[]): Array<{
  user: TokenExpiryRow['user'];
  tokens: TokenExpiryRow[];
}> {
  const groups = new Map<string, { user: TokenExpiryRow['user']; tokens: TokenExpiryRow[] }>();
  for (const row of rows) {
    const group = groups.get(row.user.id);
    if (group) group.tokens.push(row);
    else groups.set(row.user.id, { user: row.user, tokens: [row] });
  }
  return [...groups.values()];
}
