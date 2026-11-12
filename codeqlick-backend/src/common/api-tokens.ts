import type { AuthUser } from './types/auth-user.js';

/** Every Codeqlick Cloud API token starts with this. */
export const API_TOKEN_PREFIX = 'cqk_';

/** Injection token of the service that turns an API token into its person (the Cloud module). */
export const API_TOKEN_RESOLVER = Symbol('API_TOKEN_RESOLVER');

export interface ApiTokenResolver {
  /** The token's person, or null when it is unknown, expired or its account can't sign in. */
  resolve(token: string, ip: string | undefined): Promise<AuthUser | null>;
}
