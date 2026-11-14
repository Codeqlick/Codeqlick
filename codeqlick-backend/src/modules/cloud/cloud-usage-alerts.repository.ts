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

  /**
   * The teams with a build queued, a form submission, an analytics event or a deployment since.
   * Each branch walks an index on its timestamp; nothing else is read.
   */
  async activeTeamIds(since: Date): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ team_id: string }>>`
      SELECT p.team_id::text AS team_id FROM cloud_builds b
        JOIN cloud_projects p ON p.id = b.project_id WHERE b.queued_at >= ${since}
      UNION
      SELECT p.team_id::text FROM cloud_form_submissions s
        JOIN cloud_forms f ON f.id = s.form_id
        JOIN cloud_projects p ON p.id = f.project_id WHERE s.created_at >= ${since}
      UNION
      SELECT team_id::text FROM cloud_analytics_events WHERE created_at >= ${since}
      UNION
      SELECT p.team_id::text FROM cloud_deployments d
        JOIN cloud_projects p ON p.id = d.project_id WHERE d.created_at >= ${since}`;
    return rows.map((row) => row.team_id);
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
