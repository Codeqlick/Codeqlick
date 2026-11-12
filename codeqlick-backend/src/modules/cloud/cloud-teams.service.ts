import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import { cloudInviteEmail } from './cloud-emails.js';
import { ROLE_RANK, type CloudCtx, type CloudRoleName } from './cloud-caller.js';
import {
  CLOUD_PLANS,
  CLOUD_TERMS_VERSION,
  FREE,
  INVITE_DAYS,
  type CloudLimits,
} from './cloud-plans.js';
import { CloudRepository, type MembershipRow } from './cloud.repository.js';
import type {
  CreateTeamInput,
  InviteInput,
  MemberRoleInput,
  TermsInput,
  UpdateTeamInput,
} from './cloud.schemas.js';
import { CloudStorage, deploymentLabel, productionLabel } from './cloud.storage.js';
import { sha256 } from './cloud-tokens.service.js';

export interface TeamView {
  id: string;
  slug: string;
  name: string;
  plan: 'FREE' | 'PRO';
  role: CloudRoleName;
  createdAt: string;
}

export interface MeView {
  user: { id: string; name: string; email: string };
  via: 'session' | 'token';
  token: { id: string; name: string; teamId: string | null } | null;
  teams: Array<Pick<TeamView, 'id' | 'slug' | 'name' | 'role' | 'plan'>>;
  termsVersion: string;
}

export interface MembersView {
  items: Array<{
    userId: string;
    name: string;
    email: string;
    role: CloudRoleName;
    joinedAt: string;
  }>;
  invites: Array<{ id: string; email: string; role: CloudRoleName; expiresAt: string }>;
}

export interface UsageView {
  plan: 'FREE' | 'PRO';
  limits: CloudLimits;
  projects: number;
  storageBytes: number;
  deploymentsLastHour: number;
  members: number;
}

export interface EventView {
  id: string;
  action: string;
  actor: { id: string | null; name: string };
  token: string | null;
  targetLabel: string | null;
  details: unknown;
  ip: string | null;
  createdAt: string;
}

export interface InviteView {
  team: { name: string; slug: string };
  role: CloudRoleName;
  invitedBy: string | null;
  email: string;
  expiresAt: string;
  emailMatches: boolean;
}

const DAY_MS = 86_400_000;

/** Teams, members, invitations, usage and events of Codeqlick Cloud (architecture 4.13). */
@Injectable()
export class CloudTeamsService {
  private readonly logger = new Logger(CloudTeamsService.name);

  constructor(
    private readonly repository: CloudRepository,
    private readonly storage: CloudStorage,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * The caller's membership of a team with at least `min` role. Not a member, or a token
   * restricted to another team: 404. A role too low: 403.
   */
  async access(
    ctx: CloudCtx,
    teamSlug: string,
    min: CloudRoleName = 'MEMBER',
  ): Promise<MembershipRow> {
    const membership = await this.repository.membership(teamSlug, ctx.user.id);
    if (!membership) throw new NotFoundException('Team not found');
    this.checkAccess(ctx, membership, min);
    return membership;
  }

  /** Same as `access`, from a team's id (projects carry it). */
  async accessById(
    ctx: CloudCtx,
    teamId: string,
    min: CloudRoleName = 'MEMBER',
  ): Promise<MembershipRow> {
    const membership = await this.repository.membershipByTeamId(teamId, ctx.user.id);
    if (!membership) throw new NotFoundException('Not found');
    this.checkAccess(ctx, membership, min);
    return membership;
  }

  private checkAccess(ctx: CloudCtx, membership: MembershipRow, min: CloudRoleName): void {
    const restricted = ctx.user.token?.teamId;
    if (restricted && restricted !== membership.teamId) throw new NotFoundException('Not found');
    if (ROLE_RANK[membership.role] < ROLE_RANK[min]) {
      throw new ForbiddenException(`Only a team ${min.toLowerCase()} can do this`);
    }
  }

  limits(plan: 'FREE' | 'PRO'): CloudLimits {
    return CLOUD_PLANS[plan];
  }

  /** Records a change in the team's events (a failure is logged, never fails the change). */
  async record(
    ctx: CloudCtx,
    teamId: string,
    action: string,
    targetLabel: string | null,
    details?: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      await this.repository.event({
        teamId,
        actorId: ctx.user.id,
        actorName: ctx.user.name || ctx.user.email,
        tokenName: ctx.user.token?.name ?? null,
        action,
        targetLabel,
        details,
        ip: ctx.ip,
      });
    } catch (error) {
      this.logger.error(`Could not record ${action}: ${String(error)}`);
    }
  }

  async me(ctx: CloudCtx): Promise<MeView> {
    const memberships = await this.repository.memberships(ctx.user.id);
    const restricted = ctx.user.token?.teamId;
    return {
      user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
      via: ctx.user.via ?? 'session',
      token: ctx.user.token ?? null,
      teams: memberships
        .filter((m) => !restricted || m.teamId === restricted)
        .map((m) => ({
          id: m.team.id,
          slug: m.team.slug,
          name: m.team.name,
          role: m.role,
          plan: m.team.plan,
        })),
      termsVersion: CLOUD_TERMS_VERSION,
    };
  }

  private checkTerms(input: TermsInput): void {
    if (input.termsVersion !== CLOUD_TERMS_VERSION) {
      throw new ConflictException('The Cloud terms changed: read them again');
    }
  }

  async createTeam(ctx: CloudCtx, input: CreateTeamInput): Promise<TeamView> {
    this.checkTerms(input);
    const [owned, joined] = await Promise.all([
      this.repository.countMemberships(ctx.user.id, 'OWNER'),
      this.repository.countMemberships(ctx.user.id),
    ]);
    if (owned >= FREE.teamsOwned)
      throw new ConflictException(`You can own at most ${FREE.teamsOwned} teams`);
    if (joined >= FREE.teamsJoined)
      throw new ConflictException(`You can be in at most ${FREE.teamsJoined} teams`);
    // `tokens` is the console's own page (/console/tokens), not a team.
    if (input.slug === 'tokens' || (await this.repository.teamSlugTaken(input.slug))) {
      throw new ConflictException('That team address is taken');
    }
    const team = await this.repository.createTeam({
      name: input.name,
      slug: input.slug,
      userId: ctx.user.id,
      termsVersion: input.termsVersion,
    });
    await this.record(ctx, team.id, 'team.created', team.name);
    return teamView(team, 'OWNER');
  }

  async getTeam(ctx: CloudCtx, slug: string): Promise<TeamView> {
    const membership = await this.access(ctx, slug);
    return teamView(membership.team, membership.role);
  }

  async updateTeam(ctx: CloudCtx, slug: string, input: UpdateTeamInput): Promise<TeamView> {
    const membership = await this.access(ctx, slug, 'ADMIN');
    const team = await this.repository.updateTeam(membership.teamId, input.name);
    await this.record(ctx, team.id, 'team.renamed', team.name, { from: membership.team.name });
    return teamView(team, membership.role);
  }

  /** Deletes the team with everything in it: its sites go offline at once. */
  async deleteTeam(ctx: CloudCtx, slug: string): Promise<void> {
    const membership = await this.access(ctx, slug, 'OWNER');
    await this.removeTeamFiles(membership.teamId);
    await this.repository.deleteTeam(membership.teamId);
  }

  /** Takes every project of a team offline and deletes its files (before deleting its rows). */
  async removeTeamFiles(teamId: string): Promise<void> {
    for (const project of await this.repository.teamProjects(teamId)) {
      await this.storage.unlinkHost(productionLabel(project.slug));
      for (const deployment of project.deployments) {
        await this.storage.unlinkHost(deploymentLabel(project.slug, deployment.shortId));
        await this.storage.removeDeployment(deployment.id);
      }
      for (const domain of project.domains) await this.storage.removeDomain(domain.name);
    }
  }

  async members(ctx: CloudCtx, slug: string): Promise<MembersView> {
    const membership = await this.access(ctx, slug);
    const [members, invites] = await Promise.all([
      this.repository.members(membership.teamId),
      this.repository.pendingInvites(membership.teamId, new Date()),
    ]);
    return {
      items: members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  }

  async invite(
    ctx: CloudCtx,
    slug: string,
    input: InviteInput,
  ): Promise<{ id: string; email: string; role: CloudRoleName; expiresAt: string }> {
    const membership = await this.access(ctx, slug, 'ADMIN');
    const now = new Date();
    const teamId = membership.teamId;
    if (await this.repository.memberWithEmail(teamId, input.email)) {
      throw new ConflictException('That person is already in the team');
    }
    if (await this.repository.pendingInviteFor(teamId, input.email, now)) {
      throw new ConflictException('That person is already invited');
    }
    const limits = this.limits(membership.team.plan);
    const seats =
      (await this.repository.countMembers(teamId)) +
      (await this.repository.countPendingInvites(teamId, now));
    if (seats >= limits.membersPerTeam) {
      throw new ConflictException(`A team has at most ${limits.membersPerTeam} members`);
    }
    const token = randomBytes(32).toString('base64url');
    const invite = await this.repository.createInvite({
      teamId,
      email: input.email,
      role: input.role,
      tokenHash: sha256(token),
      invitedById: ctx.user.id,
      expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY_MS),
    });
    await this.record(ctx, teamId, 'member.invited', input.email, { role: input.role });
    const url = `${this.config.cloudUrl}/${input.locale}/invite?token=${token}`;
    try {
      await this.mail.send(
        cloudInviteEmail({
          to: input.email,
          locale: input.locale,
          team: membership.team.name,
          invitedBy: ctx.user.name || ctx.user.email,
          role: input.role,
          url,
          siteUrl: this.config.siteUrl,
        }),
      );
    } catch (error) {
      this.logger.error(`Invitation email to ${input.email} failed: ${String(error)}`);
    }
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async revokeInvite(ctx: CloudCtx, slug: string, id: string): Promise<void> {
    const membership = await this.access(ctx, slug, 'ADMIN');
    if (!(await this.repository.deleteInvite(membership.teamId, id))) {
      throw new NotFoundException('Invitation not found');
    }
    await this.record(ctx, membership.teamId, 'member.invite_revoked', null);
  }

  private async liveInvite(token: string) {
    const invite = await this.repository.findInviteByHash(sha256(token));
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
      throw new NotFoundException('This invitation is unknown, used or expired');
    }
    return invite;
  }

  async getInvite(ctx: CloudCtx, token: string): Promise<InviteView> {
    const invite = await this.liveInvite(token);
    return {
      team: { name: invite.team.name, slug: invite.team.slug },
      role: invite.role,
      invitedBy: invite.invitedBy?.name ?? null,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      emailMatches: invite.email.toLowerCase() === ctx.user.email.toLowerCase(),
    };
  }

  async acceptInvite(
    ctx: CloudCtx,
    token: string,
    terms: TermsInput,
  ): Promise<{ team: { slug: string; name: string } }> {
    this.checkTerms(terms);
    const invite = await this.liveInvite(token);
    if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation is for another email address');
    }
    if ((await this.repository.countMemberships(ctx.user.id)) >= FREE.teamsJoined) {
      throw new ConflictException(`You can be in at most ${FREE.teamsJoined} teams`);
    }
    if (
      !(await this.repository.acceptInvite(invite, ctx.user.id, terms.termsVersion, new Date()))
    ) {
      throw new NotFoundException('This invitation is unknown, used or expired');
    }
    await this.record(ctx, invite.teamId, 'member.joined', ctx.user.email, { role: invite.role });
    return { team: { slug: invite.team.slug, name: invite.team.name } };
  }

  async setRole(
    ctx: CloudCtx,
    slug: string,
    userId: string,
    input: MemberRoleInput,
  ): Promise<void> {
    const membership = await this.access(ctx, slug, 'ADMIN');
    const target = await this.repository.membershipByTeamId(membership.teamId, userId);
    if (!target) throw new NotFoundException('Member not found');
    // Owners are made and unmade by owners only.
    if ((input.role === 'OWNER' || target.role === 'OWNER') && membership.role !== 'OWNER') {
      throw new ForbiddenException('Only an owner can change owners');
    }
    if (target.role === 'OWNER' && input.role !== 'OWNER') {
      if ((await this.repository.countOwners(membership.teamId)) <= 1) {
        throw new ConflictException('A team needs at least one owner');
      }
    }
    if (input.role === 'OWNER' && target.role !== 'OWNER') {
      if ((await this.repository.countMemberships(userId, 'OWNER')) >= FREE.teamsOwned) {
        throw new ConflictException(`That person already owns ${FREE.teamsOwned} teams`);
      }
    }
    await this.repository.setRole(membership.teamId, userId, input.role);
    await this.record(ctx, membership.teamId, 'member.role_changed', null, {
      userId,
      from: target.role,
      to: input.role,
    });
  }

  async removeMember(ctx: CloudCtx, slug: string, userId: string): Promise<void> {
    const self = userId === ctx.user.id;
    const membership = await this.access(ctx, slug, self ? 'MEMBER' : 'ADMIN');
    const target = self
      ? membership
      : await this.repository.membershipByTeamId(membership.teamId, userId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'OWNER') {
      if (!self && membership.role !== 'OWNER')
        throw new ForbiddenException('Only an owner can remove an owner');
      if ((await this.repository.countOwners(membership.teamId)) <= 1) {
        throw new ConflictException('A team needs at least one owner');
      }
    }
    await this.repository.removeMember(membership.teamId, userId);
    await this.record(ctx, membership.teamId, self ? 'member.left' : 'member.removed', null, {
      userId,
    });
  }

  async usage(ctx: CloudCtx, slug: string): Promise<UsageView> {
    const membership = await this.access(ctx, slug);
    const teamId = membership.teamId;
    const [projects, storageBytes, deploymentsLastHour, members] = await Promise.all([
      this.repository.countProjects(teamId),
      this.repository.storageBytes(teamId),
      this.repository.countDeploymentsSince(teamId, new Date(Date.now() - 3_600_000)),
      this.repository.countMembers(teamId),
    ]);
    return {
      plan: membership.team.plan,
      limits: this.limits(membership.team.plan),
      projects,
      storageBytes,
      deploymentsLastHour,
      members,
    };
  }

  async events(
    ctx: CloudCtx,
    slug: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<EventView>> {
    const membership = await this.access(ctx, slug);
    const { skip, take } = pageToSkipTake(page, pageSize);
    const [rows, total] = await this.repository.events(membership.teamId, skip, take);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        actor: { id: row.actorId, name: row.actorName },
        token: row.tokenName,
        targetLabel: row.targetLabel,
        details: row.details,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  /**
   * Before an account is deleted (architecture 4.13, Privacy): refused while it is the last
   * owner of a team with other members; its teams with nobody else are deleted with it.
   */
  async beforeAccountDeletion(userId: string): Promise<void> {
    const { alone, lastOwner } = await this.repository.soleTeams(userId);
    if (lastOwner.length > 0) {
      throw new BadRequestException(
        `Transfer the ownership of your Codeqlick Cloud teams first: ${lastOwner.join(', ')}`,
      );
    }
    for (const teamId of alone) {
      await this.removeTeamFiles(teamId);
      await this.repository.deleteTeam(teamId);
    }
  }
}

function teamView(
  team: { id: string; slug: string; name: string; plan: 'FREE' | 'PRO'; createdAt: Date },
  role: CloudRoleName,
): TeamView {
  return {
    id: team.id,
    slug: team.slug,
    name: team.name,
    plan: team.plan,
    role,
    createdAt: team.createdAt.toISOString(),
  };
}
