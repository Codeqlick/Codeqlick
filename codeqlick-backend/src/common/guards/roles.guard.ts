import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { UserRole } from '../types/auth-user.js';
import type { AppRequest } from '../types/request.js';

/** Message of the 403 an admin without two-step verification gets when it is required. */
export const TWO_FACTOR_REQUIRED = 'Two-step verification is required for admin accounts';

/**
 * Global guard: enforces @Roles(...) after JwtAuthGuard has set `request.user`. With
 * ADMIN_TWO_FACTOR_REQUIRED, admin routes also need the admin to have two-step verification on
 * (read from the database, so turning it on takes effect at once). Account routes have no
 * @Roles, so an admin can still set it up.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;

    const { user } = context.switchToHttp().getRequest<AppRequest>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    if (user.role === 'ADMIN' && this.config.adminTwoFactorRequired) {
      const row = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { totpEnabledAt: true },
      });
      if (!row?.totpEnabledAt) throw new ForbiddenException(TWO_FACTOR_REQUIRED);
    }
    return true;
  }
}
