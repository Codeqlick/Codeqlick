import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { realmFromHeader, REALM_HEADER, type RealmName } from '../realm.js';
import type { AppRequest } from '../types/request.js';

export const REALM_KEY = 'realms';

/**
 * Which accounts a route accepts: a realm, `ANY` (both), or `ADMIN`, which adds the team's
 * CODEQLICK admins to the realms listed (the 18+ moderation images, which the admin panel streams
 * through the apps' own file routes).
 */
export type RealmAccess = RealmName | 'ANY' | 'ADMIN';

/**
 * Restricts a route (or controller) to the accounts of a realm (architecture 4.18). Checked by
 * RealmGuard. A route without it accepts CODEQLICK accounts only (fail closed): a new route is
 * safe by default.
 */
export const Realm = (...realms: RealmAccess[]) => SetMetadata(REALM_KEY, realms);

/** The realm a public account route works on, from the `X-Realm` header. */
export const RequestRealm = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RealmName => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    return realmFromHeader(request.headers[REALM_HEADER]);
  },
);
