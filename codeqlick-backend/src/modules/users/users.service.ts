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
import type { SignupReason } from '../auth/auth-emails.js';
import { AuthService } from '../auth/auth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { UsersRepository } from './users.repository.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas.js';

export type AdminUser = AuthUser & {
  isActive: boolean;
  locale: ApiLocale;
  /** Clients: whether they get the Monday summary of their projects. */
  weeklyDigest: boolean;
  /** Clients: whether they get the monthly report of their managed website. */
  monthlyReport: boolean;
  /** False for a client account the team prepared that its owner hasn't made theirs (decision 17). */
  registered: boolean;
  /** A person of a client company: the company's main client account. */
  memberOfId: string | null;
  createdAt: string;
};

/** What hangs from an account (`GET /admin/users/:id`). */
export type UserOwns = { projects: number; members: number; proposals: number; tickets: number };

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
    weeklyDigest: user.weeklyDigest,
    monthlyReport: user.monthlyReport,
    registered: Boolean(user.registeredAt),
    memberOfId: user.memberOfId,
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
    const { items, total } = await this.repository.list(
      { role: query.role, memberOf: query.memberOf, accounts: query.accounts },
      skip,
      take,
    );
    return paginate(items.map(toAdminUser), total, query.page, query.pageSize);
  }

  /**
   * Creates an account. Without a password it gets a random one nobody knows and the user is
   * emailed a link: an admin to choose their password, a client (left unregistered, decision 17)
   * to create their account. A failed email doesn't undo the account; the admin can send it again.
   */
  async create(actor: AuthUser, input: CreateUserInput): Promise<CreatedUser> {
    const email = input.email.trim().toLowerCase();
    if (await this.repository.findByEmail(email)) {
      throw new ConflictException('A user with this email already exists');
    }
    if (input.memberOfId) await this.assertCompanyAccount(input.role, input.memberOfId);
    const user = await this.insert(actor, input, email);
    if (input.password !== undefined) return toAdminUser(user);

    const invitationSent = await this.invite(actor, user, undefined, 'account').then(
      () => true,
      () => false,
    );
    return { ...toAdminUser(user), invitationSent };
  }

  /**
   * The client account for an email: an existing client's, or a new unregistered one the team
   * prepares for it (decision 17). With a `reason`, an account still unregistered gets the
   * invitation to create it. An email that belongs to an admin is refused.
   */
  async findOrCreateClient(
    actor: AuthUser,
    input: { email: string; name: string; locale: ApiLocale },
    reason: SignupReason | null,
  ): Promise<{ id: string; created: boolean; registered: boolean; invitationSent?: boolean }> {
    const email = input.email.trim().toLowerCase();
    let user = await this.repository.findByEmail(email);
    let created = false;
    if (user && user.role !== 'CLIENT') {
      throw new ConflictException('This email belongs to an admin account');
    }
    if (!user) {
      user = await this.insert(actor, { ...input, role: 'CLIENT' }, email);
      created = true;
    }
    const registered = Boolean(user.registeredAt);
    if (registered || !reason) return { id: user.id, created, registered };
    const invitationSent = await this.invite(actor, user, undefined, reason).then(
      () => true,
      () => false,
    );
    return { id: user.id, created, registered, invitationSent };
  }

  /** Sends (again) the welcome email: to an unregistered client, the invitation to create it. */
  async sendInvitation(actor: AuthUser, id: string, locale?: ApiLocale): Promise<void> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.isActive) throw new BadRequestException('This account is deactivated');
    await this.invite(actor, user, locale, 'account').catch(() => {
      throw new ServiceUnavailableException('The welcome email could not be sent');
    });
  }

  /** A client without a password stays unregistered until its owner makes it theirs. */
  private async insert(
    actor: AuthUser,
    input: Pick<CreateUserInput, 'name' | 'role' | 'locale' | 'memberOfId' | 'password'>,
    email: string,
  ): Promise<User> {
    const password = input.password ?? randomBytes(32).toString('base64url');
    const user = await this.repository.create({
      email,
      name: input.name,
      role: input.role,
      memberOfId: input.memberOfId ?? null,
      locale: toDbLocale(input.locale),
      passwordHash: await this.passwords.hash(password),
      registeredAt: input.role === 'CLIENT' && input.password === undefined ? null : new Date(),
    });
    await this.activity.record(actor, {
      action: 'user.created',
      targetId: user.id,
      targetLabel: user.email,
      details: { role: user.role, ...(user.memberOfId ? { memberOf: user.memberOfId } : {}) },
    });
    return user;
  }

  /** In `locale`, or else in the user's own language. */
  private async invite(
    actor: AuthUser,
    user: User,
    locale: ApiLocale | undefined,
    reason: SignupReason,
  ): Promise<void> {
    const language = locale ?? toApiLocale(user.locale);
    try {
      if (user.role === 'CLIENT' && !user.registeredAt) {
        await this.auth.sendSignupInvitation(user, language, reason);
      } else {
        await this.auth.sendInvitation(user, language);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send the welcome email: ${message}`);
      throw error;
    }
    await this.activity.record(actor, {
      action: 'user.invited',
      targetId: user.id,
      targetLabel: user.email,
    });
  }

  async get(id: string): Promise<AdminUser & { owns: UserOwns }> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return { ...toAdminUser(user), owns: await this.repository.owns(id) };
  }

  /**
   * Deletes the account and what hangs from it (sessions, its company's people, proposals, support
   * requests); refused for your own account and while it owns projects.
   */
  async delete(actor: AuthUser, id: string): Promise<void> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (actor.id === id) throw new BadRequestException('You cannot delete your own account');
    const owns = await this.repository.owns(id);
    if (owns.projects > 0) {
      throw new ConflictException('This account still owns projects: delete them first');
    }
    await this.repository.delete(id);
    await this.activity.record(actor, {
      action: 'user.deleted',
      targetId: id,
      targetLabel: user.email,
      details: { ...owns, projects: undefined, role: user.role },
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
    if (input.weeklyDigest !== undefined) data.weeklyDigest = input.weeklyDigest;
    if (input.monthlyReport !== undefined) data.monthlyReport = input.monthlyReport;
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

  /** Members join a client's main account: a client, and not a member of another one. */
  private async assertCompanyAccount(role: string, accountId: string): Promise<void> {
    const account = await this.repository.findById(accountId);
    if (role !== 'CLIENT' || !account || account.role !== 'CLIENT' || account.memberOfId) {
      throw new BadRequestException({
        errors: [{ path: 'memberOfId', message: 'Not a client account people can be added to' }],
      });
    }
  }
}
