import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { menuSuspendedEmail } from './menus-emails.js';
import { MenusRepository } from './menus.repository.js';
import type { AdminMenusQuery, AdminReportsQuery } from './menus.schemas.js';

export interface AdminMenuView {
  id: string;
  slug: string;
  businessName: string;
  kind: 'MENU' | 'CATALOGUE';
  owner: { id: string; name: string; email: string };
  enabled: boolean;
  indexable: boolean;
  suspendedAt: string | null;
  /** Open reports. */
  reports: number;
  updatedAt: string;
}

export interface AdminMenuReportView {
  id: string;
  slug: string;
  businessName: string;
  reason: string;
  details: string;
  email: string | null;
  status: 'OPEN' | 'CLOSED';
  note: string | null;
  /** The menu now, or null once it is gone. */
  menu: { id: string; slug: string; suspended: boolean } | null;
  createdAt: string;
  closedAt: string | null;
}

/** Admin → Menus: the menus, suspending them and the abuse reports (architecture 4.20, Abuse). */
@Injectable()
export class MenusAdminService {
  private readonly logger = new Logger(MenusAdminService.name);

  constructor(
    private readonly repository: MenusRepository,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async list(query: AdminMenusQuery): Promise<Paginated<AdminMenuView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.repository.adminMenus(query.q, query.suspended, skip, take);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        businessName: row.businessName,
        kind: row.kind,
        owner: { id: row.owner.id, name: row.owner.name, email: row.owner.email },
        enabled: row.enabled,
        indexable: row.indexable,
        suspendedAt: row.suspendedAt?.toISOString() ?? null,
        reports: row._count.reports,
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async suspend(admin: AuthUser, id: string, reason: string, now = new Date()): Promise<void> {
    const menu = await this.repository.findWithOwner(id);
    if (!menu) throw new NotFoundException('Menu not found');
    if (menu.suspendedAt) throw new ConflictException('Already suspended');
    await this.repository.setSuspension(id, now, reason);
    await this.activity.record(admin, {
      action: 'menu.suspend',
      targetId: id,
      targetLabel: menu.slug,
      details: { reason },
    });
    const locale = toApiLocale(menu.owner.locale);
    try {
      await this.mail.send(
        menuSuspendedEmail({
          to: menu.owner.email,
          locale,
          businessName: menu.businessName,
          link: `${this.config.webappUrl('menu')}/${menu.slug}`,
          appUrl: `${this.config.webappUrl('menu')}/${locale}`,
          reason,
          siteUrl: this.config.siteUrl,
        }),
      );
    } catch (error) {
      this.logger.error(`Menu suspension email to ${menu.owner.email} failed: ${String(error)}`);
    }
  }

  async unsuspend(admin: AuthUser, id: string): Promise<void> {
    const menu = await this.repository.findById(id);
    if (!menu) throw new NotFoundException('Menu not found');
    if (!menu.suspendedAt) throw new ConflictException('Not suspended');
    await this.repository.setSuspension(id, null, null);
    await this.activity.record(admin, {
      action: 'menu.unsuspend',
      targetId: id,
      targetLabel: menu.slug,
    });
  }

  async reports(query: AdminReportsQuery): Promise<Paginated<AdminMenuReportView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.repository.reports(query.status, skip, take);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        businessName: row.businessName,
        reason: row.reason,
        details: row.details,
        email: row.email,
        status: row.status,
        note: row.note,
        menu: row.menu
          ? { id: row.menu.id, slug: row.menu.slug, suspended: row.menu.suspendedAt !== null }
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
    if (!(await this.repository.closeReport(id, note || null, new Date()))) {
      throw new NotFoundException('Report not found or already closed');
    }
    await this.activity.record(admin, {
      action: 'menu.report_close',
      targetId: id,
      details: note ? { note } : undefined,
    });
  }
}
