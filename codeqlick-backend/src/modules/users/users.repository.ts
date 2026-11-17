import { Injectable } from '@nestjs/common';
import type { Webapp } from '../../common/webapps.js';
import type { Prisma, Role, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { deleteUserRecomputingRatings } from '../cruising/cruising.repository.js';
import {
  USAGE_INCLUDE,
  appWhere,
  kindWhere,
  type AccountKind,
  type UserWithUsage,
} from './account-kind.js';

/**
 * The admin panel's users are CODEQLICK accounts only (architecture 4.18): every lookup here
 * answers "not found" for a NEOQLICK account, so the panel can't read or change one by its id.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: {
      role?: Role;
      memberOf?: string;
      accounts?: boolean;
      kind?: AccountKind;
      app?: Webapp;
      q?: string;
    },
    skip: number,
    take: number,
  ): Promise<{ items: UserWithUsage[]; total: number }> {
    const and: Prisma.UserWhereInput[] = [{ realm: 'CODEQLICK' }];
    if (filter.role) and.push({ role: filter.role });
    if (filter.memberOf) and.push({ memberOfId: filter.memberOf });
    else if (filter.accounts) and.push({ memberOfId: null });
    if (filter.kind) and.push(kindWhere(filter.kind));
    if (filter.app) and.push(appWhere(filter.app));
    if (filter.q) {
      and.push({
        OR: [
          { name: { contains: filter.q, mode: 'insensitive' } },
          { email: { contains: filter.q, mode: 'insensitive' } },
          { username: { contains: filter.q.replace(/^@/, '').toLowerCase() } },
        ],
      });
    }
    const where: Prisma.UserWhereInput = { AND: and };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: USAGE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  /** What hangs from the account: what deleting it takes with it, or prevents it. */
  async owns(id: string) {
    const [projects, members, proposals, tickets] = await this.prisma.$transaction([
      this.prisma.clientProject.count({ where: { clientId: id } }),
      this.prisma.user.count({ where: { memberOfId: id } }),
      this.prisma.proposal.count({ where: { clientId: id } }),
      this.prisma.supportTicket.count({ where: { clientId: id } }),
    ]);
    return { projects, members, proposals, tickets };
  }

  /** Sessions, its company's people, proposals and support requests go with it (cascade). */
  async delete(id: string): Promise<void> {
    await deleteUserRecomputingRatings(this.prisma, id);
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, realm: 'CODEQLICK' } });
  }

  /** With what its kind and apps are worked out from. */
  findWithUsage(id: string): Promise<UserWithUsage | null> {
    return this.prisma.user.findFirst({
      where: { id, realm: 'CODEQLICK' },
      include: USAGE_INCLUDE,
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { realm_email: { realm: 'CODEQLICK', email } },
    });
  }

  create(data: Prisma.UserUncheckedCreateInput): Promise<UserWithUsage> {
    return this.prisma.user.create({
      data: { ...data, realm: 'CODEQLICK' },
      include: USAGE_INCLUDE,
    });
  }

  /** Updates the user; when `revokeSessions` is true, also revokes all of their sessions. */
  async update(
    id: string,
    data: Prisma.UserUpdateInput,
    revokeSessions: boolean,
  ): Promise<UserWithUsage> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id, realm: 'CODEQLICK' },
        data,
        include: USAGE_INCLUDE,
      });
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
