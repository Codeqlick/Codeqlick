import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { REALM_KEY, type RealmAccess } from '../decorators/realm.decorator.js';
import type { AppRequest } from '../types/request.js';

/** Message of the 403 an account of the other realm gets. */
export const WRONG_REALM = 'Wrong account type';

/**
 * Global guard, after JwtAuthGuard (architecture 4.18): `@Realm('NEOQLICK')` accepts only NEOQLICK
 * sessions, `@Realm('ANY')` both (`'ADMIN'` adds CODEQLICK admins), and a route without `@Realm` only CODEQLICK ones, so a new route
 * never opens to the 18+ accounts by accident. Public routes have no session and are skipped; they
 * read the realm from `X-Realm` themselves.
 */
@Injectable()
export class RealmGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const { user } = context.switchToHttp().getRequest<AppRequest>();
    // No session on a non-public route: JwtAuthGuard refused it already; fail closed anyway.
    if (!user) throw new ForbiddenException(WRONG_REALM);

    const allowed = this.reflector.getAllAndOverride<RealmAccess[] | undefined>(
      REALM_KEY,
      targets,
    ) ?? ['CODEQLICK'];
    if (allowed.includes('ANY') || allowed.includes(user.realm)) return true;
    // A CODEQLICK admin where the route says so (moderation images).
    if (allowed.includes('ADMIN') && user.realm === 'CODEQLICK' && user.role === 'ADMIN')
      return true;
    throw new ForbiddenException(WRONG_REALM);
  }
}
