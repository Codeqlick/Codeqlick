import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppRequest } from '../../common/types/request.js';

/** Who calls a Cloud route and from where (events record the IP). */
export interface CloudCtx {
  user: AuthUser;
  ip: string | null;
}

/** Injects the caller as a CloudCtx. */
export const Caller = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CloudCtx => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (!request.user) throw new UnauthorizedException();
    return { user: request.user, ip: request.ip?.slice(0, 45) ?? null };
  },
);

export const ROLE_RANK = { MEMBER: 1, ADMIN: 2, OWNER: 3 } as const;
export type CloudRoleName = keyof typeof ROLE_RANK;

export const TWO_FACTOR_REQUIRED = 'This team requires two-step verification';

/**
 * Whether the member's own account lacks two-step verification while their team requires it
 * (architecture 4.13, decision 57): then they may only see the team and leave it.
 */
export function twoFactorBlocked(membership: {
  team: { requireTwoFactor: boolean };
  user: { totpEnabledAt: Date | null };
}): boolean {
  return membership.team.requireTwoFactor && !membership.user.totpEnabledAt;
}
