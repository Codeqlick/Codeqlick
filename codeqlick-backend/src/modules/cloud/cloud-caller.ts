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
