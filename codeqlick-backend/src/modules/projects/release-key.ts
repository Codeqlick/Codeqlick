import { createHash } from 'node:crypto';

/** Release keys are stored hashed, like passwords: a database leak doesn't leak them. */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** The key in an `Authorization: Bearer <key>` header, or '' without one. */
export function bearerKey(authorization: string | undefined): string {
  return /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1] ?? '';
}
