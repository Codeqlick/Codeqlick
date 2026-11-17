import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AppRequest } from '../types/request.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The target check of the 18+ admin routes (architecture 4.18, "Target checks"): a Codeqlick
 * admin works on the people of Neoqlick's apps only, so a route that names an account (`:userId`)
 * answers 404 when that account is not a NEOQLICK one. This keeps the moderation tools off
 * Codeqlick's own people (and answers the same as for an account that doesn't exist). A malformed id
 * is left to the route's own validation (400).
 */
@Injectable()
export class NeoqlickTargetGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const userId: unknown = request.params?.userId;
    if (typeof userId !== 'string' || !UUID.test(userId)) return true;
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { realm: true },
    });
    if (target?.realm !== 'NEOQLICK') throw new NotFoundException('User not found');
    return true;
  }
}
