import { Injectable } from '@nestjs/common';
import type { CloudPlan } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AlertTeam {
  id: string;
  slug: string;
  name: string;
  plan: CloudPlan;
}

@Injectable()
export class CloudUsageAlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The teams with a build queued, a form submission, an analytics event or a deployment since. */
  async activeTeamIds(since: Date): Promise<string[]> {
    const [builds, submissions, events, deployments] = await Promise.all([
      this.prisma.cloudBuild.findMany({
        where: { queuedAt: { gte: since } },
        distinct: ['projectId'],
        select: { project: { select: { teamId: true } } },
      }),
      this.prisma.cloudFormSubmission.findMany({
        where: { createdAt: { gte: since } },
        distinct: ['formId'],
        select: { form: { select: { project: { select: { teamId: true } } } } },
      }),
      this.prisma.cloudAnalyticsEvent.findMany({
        where: { createdAt: { gte: since } },
        distinct: ['teamId'],
        select: { teamId: true },
      }),
      this.prisma.cloudDeployment.findMany({
        where: { createdAt: { gte: since } },
        distinct: ['projectId'],
        select: { project: { select: { teamId: true } } },
      }),
    ]);
    return [
      ...new Set([
        ...builds.map((row) => row.project.teamId),
        ...submissions.map((row) => row.form.project.teamId),
        ...events.map((row) => row.teamId),
        ...deployments.map((row) => row.project.teamId),
      ]),
    ];
  }

  team(id: string): Promise<AlertTeam | null> {
    return this.prisma.cloudTeam.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true, plan: true },
    });
  }

  /** Claims the alert of a team, limit and period; true only for the call that inserted it. */
  async claim(input: {
    teamId: string;
    key: string;
    period: string;
    percent: number;
    used: number;
    limit: number;
  }): Promise<boolean> {
    const { count } = await this.prisma.cloudUsageAlert.createMany({
      data: [{ ...input, used: BigInt(input.used), limit: BigInt(input.limit) }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.cloudUsageAlert.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }
}
