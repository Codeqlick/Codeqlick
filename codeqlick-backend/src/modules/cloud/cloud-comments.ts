import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The pure parts of preview comments (architecture 4.13 "Preview comments", decision 111): the
 * overlay's token and the limits.
 */

/** How long a comments token lasts. */
export const COMMENT_TOKEN_TTL_SECONDS = 2 * 3600;
/** Comments per thread. */
export const COMMENTS_PER_THREAD = 100;
/** Threads per project. */
export const THREADS_PER_PROJECT = 2000;
/** Threads the inbox and the overlay list at once. */
export const THREADS_LISTED = 200;
/** The header the overlay sends its token in. */
export const COMMENTS_HEADER = 'x-codeqlick-comments';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INTEGER = /^(?:0|[1-9]\d{0,14})$/;

export interface CommentClaim {
  userId: string;
  projectId: string;
  deploymentId: string;
  /** Unix seconds. */
  expiresAt: number;
}

function sign(key: Buffer, payload: string, host: string): string {
  return createHmac('sha256', key).update(`${payload}\n${host.toLowerCase()}`).digest('base64url');
}

/** `v1.<userId>.<projectId>.<deploymentId>.<expiry>.<signature>`, signed with the address. */
export function signCommentToken(key: Buffer, claim: CommentClaim, host: string): string {
  const payload = `v1.${claim.userId}.${claim.projectId}.${claim.deploymentId}.${claim.expiresAt}`;
  return `${payload}.${sign(key, payload, host)}`;
}

/** The token's claim when it was signed for this address and hasn't expired; else null. */
export function verifyCommentToken(
  key: Buffer,
  value: string | undefined,
  host: string,
  now: number = Date.now(),
): CommentClaim | null {
  if (!value || value.length > 400) return null;
  const parts = value.split('.');
  if (parts.length !== 6) return null;
  const [version, userId, projectId, deploymentId, expiry, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== 'v1' || !INTEGER.test(expiry)) return null;
  if (![userId, projectId, deploymentId].every((id) => UUID.test(id))) return null;
  const expected = Buffer.from(sign(key, parts.slice(0, 5).join('.'), host));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const expiresAt = Number(expiry);
  if (expiresAt * 1000 <= now) return null;
  return { userId, projectId, deploymentId, expiresAt };
}

/**
 * Only a deployment's own address (`<slug>--<8 hex>.<domain>`, Nginx's kind `previews`) answers
 * comments: never production, custom domains or branch addresses.
 */
export function commentsAllowed(kind: string | undefined, host: string | undefined): boolean {
  return kind === 'previews' && /^[a-z0-9-]+--[0-9a-f]{8}\./.test(host?.trim().toLowerCase() ?? '');
}

/** The event label of a thread: `<short id> <path>`, cut to fit. */
export function threadLabel(shortId: string, path: string): string {
  return `${shortId} ${path}`.slice(0, 200);
}
