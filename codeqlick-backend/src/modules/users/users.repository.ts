import { Injectable } from '@nestjs/common';
import type { Prisma, Role, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: { role?: Role; memberOf?: string; accounts?: boolean },
    skip: number,
    take: number,
  ): Promise<{ items: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {};
    if (filter.role) where.role = filter.role;
    if (filter.memberOf) where.memberOfId = filter.memberOf;
    else if (filter.accounts) where.memberOfId = null;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: Prisma.UserUncheckedCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /** Updates the user; when `revokeSessions` is true, also revokes all of their sessions. */
  async update(id: string, data: Prisma.UserUpdateInput, revokeSessions: boolean): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data });
      if (revokeSessions) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return user;
    });
  }
}
