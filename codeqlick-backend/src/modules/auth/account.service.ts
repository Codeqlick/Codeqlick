import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { DISPOSABLE_EMAIL_ERROR, isDisposableEmail } from '../../common/disposable-email.js';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { User } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import {
  accountDeletedEmail,
  emailChangeConfirmEmail,
  emailChangedNoticeEmail,
} from './account-emails.js';
import { AccountRepository } from './account.repository.js';
import { AvatarStorage, processAvatar } from './avatar.storage.js';
import { RESERVED_USERNAMES, USERNAME_PATTERN } from './auth.schemas.js';
import { hashRefreshToken, toAuthUser } from './auth.service.js';
import { PasswordService } from './password.service.js';

/** How long the link that confirms a new email works. */
export const EMAIL_CHANGE_TTL_HOURS = 24;

/** What people do with their own account: name, email, a copy of their data, deleting it. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly repository: AccountRepository,
    private readonly passwords: PasswordService,
    private readonly config: AppConfigService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly avatars: AvatarStorage,
  ) {}

  /** Sets the profile photo (re-encoded to a 256×256 WebP); the old file is deleted. */
  async setAvatar(userId: string, data: Buffer | undefined): Promise<AuthUser> {
    const user = await this.activeUser(userId);
    if (!data || data.length === 0) {
      throw new BadRequestException('Send the image in a multipart field called "file"');
    }
    const image = await processAvatar(data);
    if (!image) throw new BadRequestException('Only PNG, JPEG and WebP photos are accepted');
    const key = await this.avatars.write(image);
    let updated: User;
    try {
      updated = await this.repository.updateProfile(userId, { avatarKey: key });
    } catch (error) {
      await this.avatars.remove(key);
      throw error;
    }
    await this.avatars.remove(user.avatarKey);
    return toAuthUser(updated);
  }

  async removeAvatar(userId: string): Promise<AuthUser> {
    const user = await this.activeUser(userId);
    if (!user.avatarKey) return toAuthUser(user);
    const updated = await this.repository.updateProfile(userId, { avatarKey: null });
    await this.avatars.remove(user.avatarKey);
    return toAuthUser(updated);
  }

  async updateMe(userId: string, input: { name?: string; locale?: ApiLocale }): Promise<AuthUser> {
    await this.activeUser(userId);
    const user = await this.repository.updateProfile(userId, {
      name: input.name,
      locale: input.locale ? toDbLocale(input.locale) : undefined,
    });
    return toAuthUser(user);
  }

  /** Why a username can't be used by `userId` (`invalid`, `reserved`, `taken`), or null. */
  async usernameProblem(
    userId: string,
    username: string,
  ): Promise<'invalid' | 'reserved' | 'taken' | null> {
    if (!USERNAME_PATTERN.test(username)) return 'invalid';
    if (RESERVED_USERNAMES.has(username.replace(/[._]/g, ''))) return 'reserved';
    const owner = await this.repository.usernameOwner(username);
    return owner && owner.id !== userId ? 'taken' : null;
  }

  async usernameAvailable(userId: string, username: string) {
    const reason = await this.usernameProblem(userId, username);
    return reason ? { username, available: false, reason } : { username, available: true };
  }

  /**
   * Chooses, changes or (null) removes the caller's username. The old one is free for anyone at
   * once; the unique index settles two people saving the same name together (409).
   */
  async setUsername(userId: string, username: string | null): Promise<AuthUser> {
    const user = await this.activeUser(userId);
    if (username === user.username) return toAuthUser(user);
    if (username !== null) {
      const problem = await this.usernameProblem(userId, username);
      if (problem === 'taken') throw new ConflictException('This username is taken');
      if (problem) {
        throw new BadRequestException({
          errors: [{ field: 'username', message: `Username ${problem}` }],
        });
      }
    }
    const updated = await this.repository.updateProfile(userId, { username });
    await this.activity.record(toAuthUser(updated), {
      action: 'account.username_changed',
      targetId: user.id,
      targetLabel: username ? `@${username}` : user.email,
      details: { from: user.username, to: username },
    });
    return toAuthUser(updated);
  }

  /** Emails a confirmation link to the new address; the account keeps its email until then. */
  async requestEmailChange(
    userId: string,
    input: { email: string; password: string; locale: ApiLocale },
  ): Promise<void> {
    const user = await this.activeUser(userId);
    await this.checkPassword(user, input.password);
    const email = input.email.trim().toLowerCase();
    if (isDisposableEmail(email)) {
      throw new BadRequestException({ errors: [DISPOSABLE_EMAIL_ERROR] });
    }
    if (email === user.email) {
      throw new BadRequestException({
        errors: [{ path: 'email', message: 'This is already your email' }],
      });
    }
    if (await this.repository.emailTaken(email)) {
      throw new ConflictException('This email already has an account');
    }

    const token = randomBytes(32).toString('base64url');
    await this.repository.replaceEmailChange(
      user.id,
      email,
      hashRefreshToken(token),
      new Date(Date.now() + EMAIL_CHANGE_TTL_HOURS * 3_600_000),
    );
    const link = `${this.config.siteUrl}/${input.locale}/confirm-email?token=${token}`;
    this.send(
      emailChangeConfirmEmail(
        user,
        email,
        link,
        input.locale,
        EMAIL_CHANGE_TTL_HOURS,
        this.config.siteUrl,
      ),
    );
  }

  /** The emailed link: the account moves to the new address and every session ends. */
  async confirmEmailChange(token: string): Promise<{ email: string }> {
    const result = await this.repository.confirmEmailChange(hashRefreshToken(token));
    if (result.status === 'invalid') {
      throw new BadRequestException('This link is invalid or has expired');
    }
    if (result.status === 'taken') {
      throw new ConflictException('This email already has an account');
    }
    const { user, oldEmail } = result;
    await this.activity.record(toAuthUser(user), {
      action: 'account.email_changed',
      targetId: user.id,
      targetLabel: user.email,
      details: { from: oldEmail },
    });
    this.send(
      emailChangedNoticeEmail(
        user,
        oldEmail,
        user.email,
        toApiLocale(user.locale),
        this.config.siteUrl,
      ),
    );
    return { email: user.email };
  }

  /** A copy of everything the platform keeps about the caller (GDPR access and portability). */
  async export(caller: AuthUser) {
    const user = await this.activeUser(caller.id);
    const account = user.role === 'CLIENT' ? accountOf(caller) : null;
    return {
      exportedAt: new Date().toISOString(),
      by: 'Codeqlick',
      ...(await this.repository.export(user.id, account)),
    };
  }

  /**
   * Deletes the caller's account. Admins are deleted by another admin; a client account that owns
   * projects is closed by the team (its contracts and invoices must be kept).
   */
  async deleteMe(userId: string, password: string): Promise<void> {
    const user = await this.activeUser(userId);
    await this.checkPassword(user, password);
    if (user.role === 'ADMIN') {
      throw new ForbiddenException('Admin accounts are deleted by another admin');
    }
    if (!user.memberOfId && (await this.repository.ownedProjects(user.id)) > 0) {
      throw new ConflictException('This account owns projects: ask the team to close it');
    }
    // Recorded first (the log's link to the account is cleared with it), without who it was.
    await this.activity.record(
      { ...toAuthUser(user), name: 'Deleted account', email: '' },
      { action: 'account.deleted', targetId: user.id, details: { role: user.role } },
    );
    await this.repository.delete(user.id);
    await this.avatars.remove(user.avatarKey);
    if (user.registeredAt) {
      this.send(accountDeletedEmail(user, toApiLocale(user.locale), this.config.siteUrl));
    }
  }

  private async activeUser(userId: string): Promise<User> {
    const user = await this.repository.findById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');
    return user;
  }

  /** 400 with a field error, not 401: the caller is signed in, they just mistyped it. */
  private async checkPassword(user: User, password: string): Promise<void> {
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new BadRequestException({
        errors: [{ path: 'password', message: 'Password is incorrect' }],
      });
    }
  }

  private send(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send an account email: ${reason}`);
    });
  }
}
