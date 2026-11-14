import { Injectable } from '@nestjs/common';
import type {
  CloudDeployment,
  CloudDomain,
  CloudDomainState,
  CloudInvite,
  CloudMember,
  CloudProject,
  CloudReportReason,
  CloudReportStatus,
  CloudRole,
  CloudTeam,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type MembershipRow = CloudMember & { team: CloudTeam };
export type MemberRow = CloudMember & { user: { id: string; name: string; email: string } };
export type InviteRow = CloudInvite & {
  team: CloudTeam;
  invitedBy: { name: string } | null;
};

const deploymentInclude = {
  createdBy: { select: { id: true, name: true } },
  token: { select: { name: true } },
} as const;
export type DeploymentRow = CloudDeployment & {
  createdBy: { id: string; name: string } | null;
  token: { name: string } | null;
};

const projectInclude = {
  team: true,
  production: { include: deploymentInclude },
  domains: { orderBy: { createdAt: 'asc' } },
} as const;
export type ProjectRow = CloudProject & {
  team: CloudTeam;
  production: DeploymentRow | null;
  domains: CloudDomain[];
};

export type DomainRow = CloudDomain & {
  project: CloudProject & { team: CloudTeam };
};

export interface EventInput {
  teamId: string;
  actorId: string | null;
  actorName: string;
  tokenName: string | null;
  action: string;
  targetLabel?: string | null;
  details?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** The only code that touches Codeqlick Cloud's tables (architecture 4.13). */
@Injectable()
export class CloudRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Teams and members ──────────────────────────────────────────────────────────────────────

  memberships(userId: string): Promise<MembershipRow[]> {
    return this.prisma.cloudMember.findMany({
      where: { userId },
      include: { team: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  membership(teamSlug: string, userId: string): Promise<MembershipRow | null> {
    return this.prisma.cloudMember.findFirst({
      where: { userId, team: { slug: teamSlug } },
      include: { team: true },
    });
  }

  membershipByTeamId(teamId: string, userId: string): Promise<MembershipRow | null> {
    return this.prisma.cloudMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      include: { team: true },
    });
  }

  countMemberships(userId: string, role?: CloudRole): Promise<number> {
    return this.prisma.cloudMember.count({ where: { userId, ...(role ? { role } : {}) } });
  }

  teamSlugTaken(slug: string): Promise<boolean> {
    return this.prisma.cloudTeam.count({ where: { slug } }).then((n) => n > 0);
  }

  findTeamBySlug(slug: string): Promise<CloudTeam | null> {
    return this.prisma.cloudTeam.findUnique({ where: { slug } });
  }

  createTeam(input: {
    name: string;
    slug: string;
    userId: string;
    termsVersion: string;
  }): Promise<CloudTeam> {
    return this.prisma.cloudTeam.create({
      data: {
        name: input.name,
        slug: input.slug,
        members: {
          create: {
            userId: input.userId,
            role: 'OWNER',
            termsVersion: input.termsVersion,
            termsAcceptedAt: new Date(),
          },
        },
      },
    });
  }

  updateTeam(id: string, name: string): Promise<CloudTeam> {
    return this.prisma.cloudTeam.update({ where: { id }, data: { name } });
  }

  async deleteTeam(id: string): Promise<void> {
    await this.prisma.cloudTeam.delete({ where: { id } });
  }

  members(teamId: string): Promise<MemberRow[]> {
    return this.prisma.cloudMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  countMembers(teamId: string): Promise<number> {
    return this.prisma.cloudMember.count({ where: { teamId } });
  }

  countOwners(teamId: string): Promise<number> {
    return this.prisma.cloudMember.count({ where: { teamId, role: 'OWNER' } });
  }

  async ownerEmails(
    teamId: string,
  ): Promise<Array<{ email: string; name: string; locale: 'EN' | 'ES' }>> {
    const rows = await this.prisma.cloudMember.findMany({
      where: { teamId, role: 'OWNER' },
      select: { user: { select: { email: true, name: true, locale: true } } },
    });
    return rows.map((row) => row.user);
  }

  async setRole(teamId: string, userId: string, role: CloudRole): Promise<void> {
    await this.prisma.cloudMember.update({
      where: { teamId_userId: { teamId, userId } },
      data: { role },
    });
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.prisma.cloudMember.delete({ where: { teamId_userId: { teamId, userId } } });
    // A token restricted to a team its person left is useless: drop it.
    await this.prisma.cloudToken.deleteMany({ where: { userId, teamId } });
  }

  /** Teams the person is the only member of, and teams they are the last owner of with others. */
  async soleTeams(userId: string): Promise<{ alone: string[]; lastOwner: string[] }> {
    const rows = await this.prisma.cloudMember.findMany({
      where: { userId, role: 'OWNER' },
      select: {
        teamId: true,
        team: { select: { slug: true, members: { select: { userId: true, role: true } } } },
      },
    });
    const alone: string[] = [];
    const lastOwner: string[] = [];
    for (const row of rows) {
      const others = row.team.members.filter((m) => m.userId !== userId);
      if (others.length === 0) alone.push(row.teamId);
      else if (!others.some((m) => m.role === 'OWNER')) lastOwner.push(row.team.slug);
    }
    return { alone, lastOwner };
  }

  /** A person who can still sign in, or null. */
  activeUser(id: string): Promise<{ id: string; name: string; email: string } | null> {
    return this.prisma.user.findFirst({
      where: { id, isActive: true, registeredAt: { not: null } },
      select: { id: true, name: true, email: true },
    });
  }

  // ── Invitations ────────────────────────────────────────────────────────────────────────────

  pendingInvites(teamId: string, now: Date): Promise<CloudInvite[]> {
    return this.prisma.cloudInvite.findMany({
      where: { teamId, acceptedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
    });
  }

  countPendingInvites(teamId: string, now: Date): Promise<number> {
    return this.prisma.cloudInvite.count({
      where: { teamId, acceptedAt: null, expiresAt: { gt: now } },
    });
  }

  pendingInviteFor(teamId: string, email: string, now: Date): Promise<CloudInvite | null> {
    return this.prisma.cloudInvite.findFirst({
      where: { teamId, email, acceptedAt: null, expiresAt: { gt: now } },
    });
  }

  async memberWithEmail(teamId: string, email: string): Promise<boolean> {
    const count = await this.prisma.cloudMember.count({
      where: { teamId, user: { email: { equals: email, mode: 'insensitive' } } },
    });
    return count > 0;
  }

  createInvite(data: Prisma.CloudInviteUncheckedCreateInput): Promise<CloudInvite> {
    return this.prisma.cloudInvite.create({ data });
  }

  findInviteByHash(tokenHash: string): Promise<InviteRow | null> {
    return this.prisma.cloudInvite.findUnique({
      where: { tokenHash },
      include: { team: true, invitedBy: { select: { name: true } } },
    });
  }

  async deleteInvite(teamId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.cloudInvite.deleteMany({ where: { id, teamId } });
    return count > 0;
  }

  /** Joins the invited person and spends the invitation, once (false when already used). */
  acceptInvite(
    invite: CloudInvite,
    userId: string,
    termsVersion: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.cloudInvite.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: now },
      });
      if (count === 0) return false;
      await tx.cloudMember.upsert({
        where: { teamId_userId: { teamId: invite.teamId, userId } },
        create: {
          teamId: invite.teamId,
          userId,
          role: invite.role,
          termsVersion,
          termsAcceptedAt: now,
        },
        update: {},
      });
      return true;
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────────────────────────

  async event(input: EventInput): Promise<void> {
    await this.prisma.cloudEvent.create({
      data: {
        teamId: input.teamId,
        actorId: input.actorId,
        actorName: input.actorName.slice(0, 120),
        tokenName: input.tokenName,
        action: input.action,
        targetLabel: input.targetLabel?.slice(0, 300) ?? null,
        details: input.details,
        ip: input.ip ?? null,
      },
    });
  }

  events(teamId: string, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.cloudEvent.findMany({
        where: { teamId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.cloudEvent.count({ where: { teamId } }),
    ]);
  }

  async deleteEventsBefore(date: Date): Promise<number> {
    const { count } = await this.prisma.cloudEvent.deleteMany({
      where: { createdAt: { lt: date } },
    });
    return count;
  }

  // ── Usage ──────────────────────────────────────────────────────────────────────────────────

  /** Every kept deployment's size, across Cloud (the disk guard's report). */
  async allDeploymentsBytes(): Promise<number> {
    const sum = await this.prisma.cloudDeployment.aggregate({ _sum: { sizeBytes: true } });
    return Number(sum._sum.sizeBytes ?? 0n);
  }

  async storageBytes(teamId: string): Promise<number> {
    const sum = await this.prisma.cloudDeployment.aggregate({
      where: { project: { teamId } },
      _sum: { sizeBytes: true },
    });
    return Number(sum._sum.sizeBytes ?? 0n);
  }

  countDeploymentsSince(teamId: string, since: Date): Promise<number> {
    return this.prisma.cloudDeployment.count({
      where: { project: { teamId }, createdAt: { gte: since } },
    });
  }

  // ── Projects ───────────────────────────────────────────────────────────────────────────────

  projects(teamId: string): Promise<ProjectRow[]> {
    return this.prisma.cloudProject.findMany({
      where: { teamId, deletedAt: null },
      include: projectInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Every live project of a team, with only what deleting the team needs. */
  teamProjects(teamId: string) {
    return this.prisma.cloudProject.findMany({
      where: { teamId },
      select: {
        id: true,
        slug: true,
        deletedAt: true,
        deployments: { select: { id: true, shortId: true } },
        domains: { select: { name: true } },
      },
    });
  }

  countProjects(teamId: string): Promise<number> {
    return this.prisma.cloudProject.count({ where: { teamId, deletedAt: null } });
  }

  projectSlugTaken(slug: string): Promise<boolean> {
    return this.prisma.cloudProject.count({ where: { slug } }).then((n) => n > 0);
  }

  createProject(teamId: string, name: string, slug: string): Promise<ProjectRow> {
    return this.prisma.cloudProject.create({
      data: { teamId, name, slug },
      include: projectInclude,
    });
  }

  findProject(id: string): Promise<ProjectRow | null> {
    return this.prisma.cloudProject.findFirst({
      where: { id, deletedAt: null },
      include: projectInclude,
    });
  }

  /** Every live project with password protection on (its markers, architecture 4.13). */
  protectedProjects(): Promise<Array<{ slug: string; protection: CloudProject['protection'] }>> {
    return this.prisma.cloudProject.findMany({
      where: { deletedAt: null, protection: { not: 'OFF' } },
      select: { slug: true, protection: true },
    });
  }

  findProjectBySlug(slug: string): Promise<{ id: string } | null> {
    return this.prisma.cloudProject.findFirst({ where: { slug }, select: { id: true } });
  }

  async findProjectByDomain(name: string): Promise<{ id: string } | null> {
    const row = await this.prisma.cloudDomain.findUnique({
      where: { name },
      select: { projectId: true },
    });
    return row ? { id: row.projectId } : null;
  }

  updateProject(id: string, data: Prisma.CloudProjectUncheckedUpdateInput): Promise<ProjectRow> {
    return this.prisma.cloudProject.update({ where: { id }, data, include: projectInclude });
  }

  /** Marks the project deleted (its address stays taken) and drops its deployments and domains. */
  async softDeleteProject(id: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.cloudProject.update({
        where: { id },
        data: { deletedAt: now, productionDeploymentId: null },
      }),
      this.prisma.cloudDeployment.deleteMany({ where: { projectId: id } }),
      this.prisma.cloudDomain.deleteMany({ where: { projectId: id } }),
      this.prisma.cloudForm.deleteMany({ where: { projectId: id } }),
      this.prisma.cloudDeployHook.deleteMany({ where: { projectId: id } }),
    ]);
  }

  async purgeDeletedProjects(before: Date): Promise<number> {
    const { count } = await this.prisma.cloudProject.deleteMany({
      where: { deletedAt: { lt: before } },
    });
    return count;
  }

  // ── Deployments ────────────────────────────────────────────────────────────────────────────

  deployments(projectId: string, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.cloudDeployment.findMany({
        where: { projectId },
        include: deploymentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.cloudDeployment.count({ where: { projectId } }),
    ]);
  }

  shortIdTaken(projectId: string, shortId: string): Promise<boolean> {
    return this.prisma.cloudDeployment.count({ where: { projectId, shortId } }).then((n) => n > 0);
  }

  createDeployment(data: Prisma.CloudDeploymentUncheckedCreateInput): Promise<DeploymentRow> {
    return this.prisma.cloudDeployment.create({ data, include: deploymentInclude });
  }

  findDeployment(projectId: string, id: string): Promise<DeploymentRow | null> {
    return this.prisma.cloudDeployment.findFirst({
      where: { id, projectId },
      include: deploymentInclude,
    });
  }

  async deleteDeployment(id: string): Promise<void> {
    await this.prisma.cloudDeployment.delete({ where: { id } });
  }

  /** Deployments past the newest `keep` of each project, production left out. */
  oldDeployments(keep: number) {
    return this.prisma.$queryRaw<Array<{ id: string; short_id: string; slug: string }>>`
      SELECT d.id, d.short_id, p.slug
      FROM (
        SELECT id, short_id, project_id,
               row_number() OVER (PARTITION BY project_id ORDER BY created_at DESC, id DESC) AS n
        FROM cloud_deployments
      ) d
      JOIN cloud_projects p ON p.id = d.project_id
      WHERE d.n > ${keep}
        AND (p.production_deployment_id IS NULL OR p.production_deployment_id <> d.id)
    `;
  }

  // ── Domains ────────────────────────────────────────────────────────────────────────────────

  domains(projectId: string): Promise<CloudDomain[]> {
    return this.prisma.cloudDomain.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  countDomains(projectId: string): Promise<number> {
    return this.prisma.cloudDomain.count({ where: { projectId } });
  }

  async domainTaken(name: string): Promise<boolean> {
    const [cloud, managed] = await Promise.all([
      this.prisma.cloudDomain.count({ where: { name } }),
      this.prisma.managedSite.count({
        where: { domain: { in: [name, name.replace(/^www\./, '')] } },
      }),
    ]);
    return cloud + managed > 0;
  }

  createDomain(data: Prisma.CloudDomainUncheckedCreateInput): Promise<CloudDomain> {
    return this.prisma.cloudDomain.create({ data });
  }

  findDomain(projectId: string, id: string): Promise<DomainRow | null> {
    return this.prisma.cloudDomain.findFirst({
      where: { id, projectId },
      include: { project: { include: { team: true } } },
    });
  }

  updateDomain(
    id: string,
    data: {
      state: CloudDomainState;
      verifiedAt?: Date | null;
      checkedAt: Date;
      lastError: string | null;
    },
  ): Promise<CloudDomain> {
    return this.prisma.cloudDomain.update({ where: { id }, data });
  }

  async deleteDomain(id: string): Promise<void> {
    await this.prisma.cloudDomain.delete({ where: { id } });
  }

  /** Domains whose check is due: not LIVE ones every 10 minutes for a week, then daily; LIVE ones every 6 hours. */
  domainsDue(now: Date): Promise<DomainRow[]> {
    const minutes = (n: number) => new Date(now.getTime() - n * 60_000);
    return this.prisma.cloudDomain.findMany({
      where: {
        project: { deletedAt: null },
        OR: [
          { checkedAt: null },
          {
            state: { not: 'LIVE' },
            createdAt: { gt: minutes(7 * 24 * 60) },
            checkedAt: { lt: minutes(9) },
          },
          { state: { not: 'LIVE' }, checkedAt: { lt: minutes(24 * 60) } },
          { state: 'LIVE', checkedAt: { lt: minutes(6 * 60) } },
        ],
      },
      include: { project: { include: { team: true } } },
      take: 50,
    });
  }

  /** Every verified domain of a project, to republish after promoting or lifting a suspension. */
  liveDomains(projectId: string): Promise<CloudDomain[]> {
    return this.prisma.cloudDomain.findMany({
      where: { projectId, state: { in: ['VERIFIED', 'LIVE', 'ERROR'] } },
    });
  }

  // ── Reports and admin ──────────────────────────────────────────────────────────────────────

  async createReport(data: {
    url: string;
    projectId: string | null;
    reason: CloudReportReason;
    details: string;
    email: string;
  }): Promise<void> {
    await this.prisma.cloudReport.create({ data });
  }

  reports(status: CloudReportStatus, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.cloudReport.findMany({
        where: { status },
        include: { project: { select: { id: true, slug: true, name: true, suspendedAt: true } } },
        orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
        skip,
        take,
      }),
      this.prisma.cloudReport.count({ where: { status } }),
    ]);
  }

  async closeReport(id: string, note: string | null, now: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudReport.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'CLOSED', note, closedAt: now },
    });
    return count > 0;
  }

  adminTeams(q: string | undefined, skip: number, take: number) {
    const where: Prisma.CloudTeamWhereInput = q
      ? {
          OR: [
            { slug: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { members: { some: { user: { email: { contains: q, mode: 'insensitive' } } } } },
          ],
        }
      : {};
    return this.prisma.$transaction([
      this.prisma.cloudTeam.findMany({
        where,
        include: {
          members: {
            where: { role: 'OWNER' },
            select: { user: { select: { id: true, name: true, email: true } } },
          },
          _count: { select: { members: true, projects: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.cloudTeam.count({ where }),
    ]);
  }

  adminProjects(q: string | undefined, suspended: boolean | undefined, skip: number, take: number) {
    const where: Prisma.CloudProjectWhereInput = {
      deletedAt: null,
      ...(suspended === undefined ? {} : { suspendedAt: suspended ? { not: null } : null }),
      ...(q
        ? {
            OR: [
              { slug: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { team: { slug: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return this.prisma.$transaction([
      this.prisma.cloudProject.findMany({
        where,
        include: { team: true, _count: { select: { deployments: true, domains: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.cloudProject.count({ where }),
    ]);
  }

  async projectStorage(projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.cloudDeployment.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds } },
      _sum: { sizeBytes: true },
    });
    return new Map(rows.map((row) => [row.projectId, Number(row._sum.sizeBytes ?? 0n)]));
  }

  async teamStorage(teamIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const id of teamIds) result.set(id, await this.storageBytes(id));
    return result;
  }
}
