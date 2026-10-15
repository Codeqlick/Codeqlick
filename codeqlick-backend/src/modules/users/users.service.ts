import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { AuthService } from '../auth/auth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { UsersRepository } from './users.repository.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas.js';

export type AdminUser = AuthUser & { isActive: boolean; locale: ApiLocale; createdAt: string };

/** A created user; `invitationSent` only when no password was given and a welcome email was due. */
export type CreatedUser = AdminUser & { invitationSent?: boolean };

export function toAdminUser(user: User): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    locale: toApiLocale(user.locale),
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repository: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly activity: ActivityService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<AdminUser>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(query.role, skip, take);
    return paginate(items.map(toAdminUser), total, query.page, query.pageSize);
  }

  /**
   * Creates an account. Without a password it gets a random one nobody knows and the user is
   * emailed a link to choose their own; a failed email doesn't undo the account, the admin can
   * send it again.
   */
  async create(actor: AuthUser, input: CreateUserInput): Promise<CreatedUser> {
    const email = input.email.trim().toLowerCase();
    if (await this.repository.findByEmail(email)) {
      throw new ConflictException('A user with this email already exists');
    }
    const password = input.password ?? randomBytes(32).toString('base64url');
    const user = await this.repository.create({
      email,
      name: input.name,
      role: input.role,
      locale: toDbLocale(input.locale),
      passwordHash: await this.passwords.hash(password),
    });
    await this.activity.record(actor, {
      action: 'user.created',
      targetId: user.id,
      targetLabel: user.email,
      details: { role: user.role },
    });
    if (input.password !== undefined) return toAdminUser(user);

    const invitationSent = await this.invite(actor, user).then(
      () => true,
      () => false,
    );
    return { ...toAdminUser(user), invitationSent };
  }

  /** Sends (again) the welcome email with a link to choose a password. */
  async sendInvitation(actor: AuthUser, id: string, locale?: ApiLocale): Promise<void> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.isActive) throw new BadRequestException('This account is deactivated');
    await this.invite(actor, user, locale).catch(() => {
      throw new ServiceUnavailableException('The welcome email could not be sent');
    });
  }

  /** In `locale`, or else in the user's own language. */
  private async invite(actor: AuthUser, user: User, locale?: ApiLocale): Promise<void> {
    try {
      await this.auth.sendInvitation(user, locale ?? toApiLocale(user.locale));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send the welcome email: ${reason}`);
      throw error;
    }
    await this.activity.record(actor, {
      action: 'user.invited',
      targetId: user.id,
      targetLabel: user.email,
    });
  }

  async update(actor: AuthUser, id: string, input: UpdateUserInput): Promise<AdminUser> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('User not found');

    if (actor.id === id && input.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (actor.id === id && input.role !== undefined && input.role !== existing.role) {
      throw new BadRequestException('You cannot change your own role');
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.locale !== undefined) data.locale = toDbLocale(input.locale);
    if (input.password !== undefined) data.passwordHash = await this.passwords.hash(input.password);

    // Deactivation, a password reset or a role change ends every existing session.
    const revokeSessions =
      input.isActive === false ||
      input.password !== undefined ||
      (input.role !== undefined && input.role !== existing.role);

    const user = await this.repository.update(id, data, revokeSessions);
    // What changed, without the password itself.
    const details: Record<string, unknown> = {};
    if (input.name !== undefined && input.name !== existing.name) details.name = input.name;
    if (input.role !== undefined && input.role !== existing.role) details.role = input.role;
    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      details.isActive = input.isActive;
    }
    if (input.locale !== undefined && toDbLocale(input.locale) !== existing.locale) {
      details.locale = input.locale;
    }
    if (input.password !== undefined) details.passwordReset = true;
    await this.activity.record(actor, {
      action: 'user.updated',
      targetId: id,
      targetLabel: user.email,
      details: Object.keys(details).length > 0 ? details : undefined,
    });
    return toAdminUser(user);
  }
}
