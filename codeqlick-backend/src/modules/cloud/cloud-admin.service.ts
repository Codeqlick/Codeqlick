import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { cloudReportEmail, cloudSuspendedEmail } from './cloud-emails.js';
import { CloudRepository } from './cloud.repository.js';
import type { AdminListQuery, ReportInput, ReportsQuery } from './cloud.schemas.js';
import { CloudProjectsService } from './cloud-projects.service.js';

export interface AdminTeamView {
  id: string;
  slug: string;
  name: string;
  plan: 'FREE' | 'PRO';
  owners: Array<{ id: string; name: string; email: string }>;
  members: number;
  projects: number;
  storageBytes: number;
  createdAt: string;
}

export interface AdminProjectView {
  id: string;
  slug: string;
  name: string;
  team: { slug: string; name: string };
  url: string;
  storageBytes: number;
  deployments: number;
  domains: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
}

export interface ReportView {
  id: string;
  url: string;
  reason: string;
  details: string;
  email: string;
  status: 'OPEN' | 'CLOSED';
  note: string | null;
  project: { id: string; slug: string; name: string; suspended: boolean } | null;
  createdAt: string;
  closedAt: string | null;
}

/** Admin → Cloud and the public abuse reports (architecture 4.13). */
@Injectable()
export class CloudAdminService {
  private readonly logger = new Logger(CloudAdminService.name);

  constructor(
    private readonly repository: CloudRepository,
    private readonly projects: CloudProjectsService,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /** The project an address belongs to: `<slug>[--<id>].<hosting domain>` or a custom domain. */
  private async projectOf(url: string): Promise<{ id: string } | null> {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    const hosting = this.config.cloudHosting?.domain ?? 'codeqlick.app';
    if (host.endsWith(`.${hosting}`)) {
      const label = host.slice(0, -hosting.length - 1);
      if (label.includes('.')) return null;
      return this.repository.findProjectBySlug(label.split('--')[0] ?? label);
    }
    return this.repository.findProjectByDomain(host);
  }

  async report(input: ReportInput): Promise<void> {
    if (input.website) return; // honeypot: a bot, a quiet success
    const project = await this.projectOf(input.url);
    await this.repository.createReport({
      url: input.url,
      projectId: project?.id ?? null,
      reason: input.reason,
      details: input.details,
      email: input.email,
    });
    try {
      await this.mail.send(
        cloudReportEmail({
          to: this.config.leadsNotifyTo,
          url: input.url,
          reason: input.reason,
          details: input.details,
          email: input.email,
          project: project ? ((await this.repository.findProject(project.id))?.slug ?? null) : null,
          adminUrl: `${this.config.siteUrl}/es/admin/cloud`,
          siteUrl: this.config.siteUrl,
        }),
      );
    } catch (error) {
      this.logger.error(`Cloud report email failed: ${String(error)}`);
    }
  }

  async reports(query: ReportsQuery): Promise<Paginated<ReportView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.repository.reports(query.status, skip, take);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        url: row.url,
        reason: row.reason,
        details: row.details,
        email: row.email,
        status: row.status,
        note: row.note,
        project: row.project
          ? {
              id: row.project.id,
              slug: row.project.slug,
              name: row.project.name,
              suspended: row.project.suspendedAt !== null,
            }
          : null,
        createdAt: row.createdAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async closeReport(admin: AuthUser, id: string, note: string | undefined): Promise<void> {
    if (!(await this.repository.closeReport(id, note ?? null, new Date()))) {
      throw new NotFoundException('Report not found or already closed');
    }
    await this.activity.record(admin, {
      action: 'cloud.report_closed',
      targetId: id,
      details: { note },
    });
  }

  async teams(query: AdminListQuery): Promise<Paginated<AdminTeamView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.repository.adminTeams(query.q, skip, take);
    const storage = await this.repository.teamStorage(rows.map((row) => row.id));
    return paginate(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        plan: row.plan,
        owners: row.members.map((m) => m.user),
        members: row._count.members,
        projects: row._count.projects,
        storageBytes: storage.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async projectsList(query: AdminListQuery): Promise<Paginated<AdminProjectView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.repository.adminProjects(query.q, query.suspended, skip, take);
    const storage = await this.repository.projectStorage(rows.map((row) => row.id));
    return paginate(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        team: { slug: row.team.slug, name: row.team.name },
        url: this.projects.projectUrl(row.slug),
        storageBytes: storage.get(row.id) ?? 0,
        deployments: row._count.deployments,
        domains: row._count.domains,
        suspendedAt: row.suspendedAt?.toISOString() ?? null,
        suspendedReason: row.suspendedReason,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async suspend(admin: AuthUser, id: string, reason: string): Promise<void> {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    if (project.suspendedAt) throw new ConflictException('Already suspended');
    await this.repository.updateProject(id, { suspendedAt: new Date(), suspendedReason: reason });
    await this.projects.applySuspension(project, true);
    await this.activity.record(admin, {
      action: 'cloud.suspended',
      targetId: id,
      targetLabel: project.slug,
      details: { reason },
    });
    for (const owner of await this.repository.ownerEmails(project.teamId)) {
      try {
        await this.mail.send(
          cloudSuspendedEmail({
            to: owner.email,
            locale: toApiLocale(owner.locale),
            project: project.name,
            url: this.projects.projectUrl(project.slug),
            reason,
            siteUrl: this.config.siteUrl,
          }),
        );
      } catch (error) {
        this.logger.error(`Suspension email to ${owner.email} failed: ${String(error)}`);
      }
    }
  }

  async unsuspend(admin: AuthUser, id: string): Promise<void> {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    if (!project.suspendedAt) throw new ConflictException('Not suspended');
    await this.repository.updateProject(id, { suspendedAt: null, suspendedReason: null });
    await this.projects.applySuspension(project, false);
    await this.activity.record(admin, {
      action: 'cloud.unsuspended',
      targetId: id,
      targetLabel: project.slug,
    });
  }
}
