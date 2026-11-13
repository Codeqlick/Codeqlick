import { Injectable } from '@nestjs/common';
import type { CloudTeam, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Teams' PRO subscriptions (architecture 4.13 "Plans and billing", decision 46). */
@Injectable()
export class CloudBillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  team(id: string): Promise<CloudTeam | null> {
    return this.prisma.cloudTeam.findUnique({ where: { id } });
  }

  teamByCustomer(customer: string): Promise<CloudTeam | null> {
    return this.prisma.cloudTeam.findUnique({ where: { stripeCustomerId: customer } });
  }

  update(id: string, data: Prisma.CloudTeamUpdateInput): Promise<CloudTeam> {
    return this.prisma.cloudTeam.update({ where: { id }, data });
  }
}
