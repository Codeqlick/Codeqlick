import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ActivityService } from '../activity/activity.service.js';
import { AccountRepository } from './account.repository.js';
import { toAuthUser } from './to-auth-user.js';
import {
  isReservedUsername,
  normalizeUsername,
  usernameError,
  usernameKey,
  usernameRuleProblem,
  type UsernameProblem,
} from './username.js';

/** The account's unique username: kept with its capitals, unique ignoring them. */
@Injectable()
export class UsernameService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Why `userId` can't use a username, or null. `userId` null is an account still to be made
   * (sign-up): reserved names are refused and any holder makes it taken.
   */
  async problem(userId: string | null, username: string): Promise<UsernameProblem | null> {
    if (usernameRuleProblem(username, true)) return 'invalid';
    if (isReservedUsername(username)) {
      // Reserved names keep people from posing as the team; the team's own accounts may use them.
      const caller = userId ? await this.repository.findById(userId) : null;
      if (caller?.role !== 'ADMIN') return 'reserved';
    }
    const owner = await this.repository.usernameOwner(usernameKey(username));
    return owner && owner.id !== userId ? 'taken' : null;
  }

  /** Throws the field error (400 invalid or reserved, 409 taken) unless `userId` may use it. */
  async assertUsable(userId: string | null, username: string, field = 'username'): Promise<void> {
    const problem = await this.problem(userId, username);
    if (problem) throw usernameError(problem, field);
  }

  /**
   * Chooses, changes or (null) removes the username: 400 invalid or reserved, 409 taken. The old
   * one is free at once; changing only its capitals is allowed. The unique index settles two people
   * saving the same name together.
   */
  async claim(userId: string, raw: string | null, field = 'username'): Promise<AuthUser> {
    const user = await this.repository.findById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');
    const username = raw === null ? null : normalizeUsername(raw);
    if (username === user.username) return toAuthUser(user);
    if (username !== null) await this.assertUsable(userId, username, field);
    const updated = await this.repository.setUsername(userId, username);
    if (!updated) throw usernameError('taken', field);
    await this.activity.record(toAuthUser(updated), {
      action: 'account.username_changed',
      targetId: user.id,
      targetLabel: username ? `@${username}` : user.email,
      details: { from: user.username, to: username },
    });
    return toAuthUser(updated);
  }
}
