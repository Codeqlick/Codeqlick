import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { PasswordService } from '../auth/password.service.js';
import { UsersRepository } from './users.repository.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas.js';

export type AdminUser = AuthUser & { isActive: boolean; createdAt: string };

export function toAdminUser(user: User): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<AdminUser>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(query.role, skip, take);
    return paginate(items.map(toAdminUser), total, query.page, query.pageSize);
  }

  async create(input: CreateUserInput): Promise<AdminUser> {
    const email = input.email.trim().toLowerCase();
    if (await this.repository.findByEmail(email)) {
      throw new ConflictException('A user with this email already exists');
    }
    const user = await this.repository.create({
      email,
      name: input.name,
      role: input.role,
      passwordHash: await this.passwords.hash(input.password),
    });
    return toAdminUser(user);
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
    if (input.password !== undefined) data.passwordHash = await this.passwords.hash(input.password);

    // Deactivation, a password reset or a role change ends every existing session.
    const revokeSessions =
      input.isActive === false ||
      input.password !== undefined ||
      (input.role !== undefined && input.role !== existing.role);

    const user = await this.repository.update(id, data, revokeSessions);
    return toAdminUser(user);
  }
}
