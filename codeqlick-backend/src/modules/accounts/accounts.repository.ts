import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The active people of a client account: its owner and its members, oldest first. */
  people(accountId: string) {
    return this.prisma.user.findMany({
      where: { OR: [{ id: accountId }, { memberOfId: accountId }], isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { name: true, email: true, locale: true },
    });
  }
}
