import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { RESERVED_USERNAMES, USERNAME_PATTERN } from './auth.schemas.js';
import { toAuthUser } from './auth.service.js';

export type UsernameProblem = 'invalid' | 'reserved' | 'taken';

/** Lower-cased, without a leading @ (how usernames are typed, checked and stored). */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

/**
 * The account's unique username (architecture 6, "Username").
 */
@Injectable()
export class UsernameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Why `userId` can't use a username, or null. */
  async problem(userId: string, username: string): Promise<UsernameProblem | null> {
    if (!USERNAME_PATTERN.test(username)) return 'invalid';
    if (RESERVED_USERNAMES.has(username.replace(/[._]/g, ''))) {
      // Reserved names keep people from posing as the team; the team's own accounts may use them.
      const caller = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (caller?.role !== 'ADMIN') return 'reserved';
    }
    const owner = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return owner && owner.id !== userId ? 'taken' : null;
  }

  /**
   * Chooses, changes or (null) removes the username: 400 invalid or reserved, 409 taken. The old
   * one is free at once; the unique index settles two people saving the same name together.
   */
  async claim(userId: string, raw: string | null, field = 'username'): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');
    const username = raw === null ? null : normalizeUsername(raw);
    if (username === user.username) return toAuthUser(user);
    if (username !== null) {
      const problem = await this.problem(userId, username);
      if (problem === 'taken') throw new ConflictException('This username is taken');
      if (problem) {
        throw new BadRequestException({ errors: [{ field, message: `Username ${problem}` }] });
      }
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { username } });
    await this.activity.record(toAuthUser(updated), {
      action: 'account.username_changed',
      targetId: user.id,
      targetLabel: username ? `@${username}` : user.email,
      details: { from: user.username, to: username },
    });
    return toAuthUser(updated);
  }
}
