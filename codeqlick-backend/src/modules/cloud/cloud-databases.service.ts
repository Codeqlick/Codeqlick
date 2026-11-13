import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudDatabase } from '../../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import type { CloudCtx } from './cloud-caller.js';
import { CloudDatabasesRepository, type DatabaseWithTeam } from './cloud-databases.repository.js';
import { cloudDatabaseFullEmail } from './cloud-emails.js';
import { CloudDiskService } from './cloud-disk.service.js';
import { CloudPgClient, newPgName, newPgPassword } from './cloud-pg.client.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface DatabaseView {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  sizeBytes: number;
  maxBytes: number;
  readOnly: boolean;
  blocked: boolean;
  connectionUrl: string;
  createdAt: string;
}

/** Past this share of its size a database refuses connections (read-only can be bypassed). */
const BLOCK_RATIO = 1.5;
const CHECK_MS = 10 * 60_000;

/** Projects' managed PostgreSQL databases (architecture 4.13 "Databases", decision 47). */
@Injectable()
export class CloudDatabasesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudDatabasesService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly databases: CloudDatabasesRepository,
    private readonly pg: CloudPgClient,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly disk: CloudDiskService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest || !this.pg.configured) return;
    this.timer = setInterval(() => void this.check(), CHECK_MS).unref();
    void this.check();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private settings() {
    const settings = this.config.cloudPg;
    if (!settings) throw new ServiceUnavailableException('Managed databases are not set up');
    return settings;
  }

  private url(db: CloudDatabase, password?: string): string {
    const { host, port } = this.settings();
    const secret = password ? `:${password}` : '';
    return `postgresql://${db.pgName}${secret}@${host}:${port}/${db.pgName}?sslmode=require`;
  }

  private view(db: CloudDatabase, plan: 'FREE' | 'PRO'): DatabaseView {
    const { host, port } = this.settings();
    return {
      id: db.id,
      name: db.name,
      host,
      port,
      database: db.pgName,
      user: db.pgName,
      sizeBytes: Number(db.sizeBytes),
      maxBytes: CLOUD_PLANS[plan].databaseBytes,
      readOnly: db.readOnly,
      blocked: db.blocked,
      connectionUrl: this.url(db),
      createdAt: db.createdAt.toISOString(),
    };
  }

  async list(
    ctx: CloudCtx,
    projectId: string,
  ): Promise<{ configured: boolean; items: DatabaseView[] }> {
    const { project } = await this.projects.project(ctx, projectId);
    if (!this.pg.configured) return { configured: false, items: [] };
    const rows = await this.databases.list(project.id);
    return { configured: true, items: rows.map((db) => this.view(db, project.team.plan)) };
  }

  async create(
    ctx: CloudCtx,
    projectId: string,
    name: string,
  ): Promise<DatabaseView & { password: string }> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    this.settings();
    this.disk.assertRoom();
    const limits = CLOUD_PLANS[project.team.plan];
    if ((await this.databases.count(project.id)) >= limits.databasesPerProject) {
      throw new ConflictException(
        `A project has at most ${limits.databasesPerProject} database${limits.databasesPerProject === 1 ? '' : 's'} on this plan`,
      );
    }
    const pgName = newPgName();
    const password = newPgPassword();
    await this.pg.create(pgName, password, limits.databaseConnections);
    let db: CloudDatabase;
    try {
      db = await this.databases.create({ projectId: project.id, name, pgName });
    } catch (error) {
      await this.pg.drop(pgName).catch(() => undefined);
      throw error;
    }
    await this.teams.record(ctx, membership.teamId, 'database.created', `${project.slug}/${name}`);
    return { ...this.view(db, project.team.plan), password, connectionUrl: this.url(db, password) };
  }

  async resetPassword(
    ctx: CloudCtx,
    projectId: string,
    id: string,
  ): Promise<DatabaseView & { password: string }> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const db = await this.databases.find(project.id, id);
    if (!db) throw new NotFoundException('Database not found');
    const password = newPgPassword();
    await this.pg.setPassword(db.pgName, password);
    await this.pg.endSessions(db.pgName);
    await this.teams.record(
      ctx,
      membership.teamId,
      'database.password_reset',
      `${project.slug}/${db.name}`,
    );
    return { ...this.view(db, project.team.plan), password, connectionUrl: this.url(db, password) };
  }

  async remove(ctx: CloudCtx, projectId: string, id: string): Promise<void> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const db = await this.databases.find(project.id, id);
    if (!db) throw new NotFoundException('Database not found');
    await this.pg.drop(db.pgName);
    await this.databases.delete(db.id);
    await this.teams.record(
      ctx,
      membership.teamId,
      'database.deleted',
      `${project.slug}/${db.name}`,
    );
  }

  // ── Sizes and limits, every 10 minutes ───────────────────────────────────────────────────────

  async check(now = new Date()): Promise<void> {
    try {
      for (const orphan of await this.databases.orphans()) {
        await this.pg.drop(orphan.pgName);
        await this.databases.delete(orphan.id);
      }
      const state = await this.pg.state();
      for (const db of await this.databases.all()) {
        const live = state.get(db.pgName);
        if (!live) continue;
        await this.apply(db, live, now);
      }
    } catch (error) {
      this.logger.error(`The databases' check failed: ${String(error)}`);
    }
  }

  private async apply(
    db: DatabaseWithTeam,
    live: { bytes: number; connections: number },
    now: Date,
  ): Promise<void> {
    const limits = CLOUD_PLANS[db.project.team.plan];
    // A full disk freezes every database (decision 49); its own size, only its own.
    const overSize = live.bytes > limits.databaseBytes;
    const over = overSize || this.disk.full;
    const blocked = live.bytes > limits.databaseBytes * BLOCK_RATIO;
    const connections = blocked ? 0 : limits.databaseConnections;
    if (live.connections !== connections) {
      await this.pg.setConnections(db.pgName, connections);
      if (blocked) await this.pg.endSessions(db.pgName);
    }
    if (over !== db.readOnly) await this.pg.setReadOnly(db.pgName, over);
    await this.databases.update(db.id, {
      sizeBytes: BigInt(live.bytes),
      readOnly: over,
      blocked,
      sizeCheckedAt: now,
    });
    if (overSize && !db.readOnly) await this.tellAdmins(db, limits.databaseBytes);
  }

  private async tellAdmins(db: DatabaseWithTeam, maxBytes: number): Promise<void> {
    try {
      for (const admin of await this.databases.admins(db.project.teamId)) {
        const locale = toApiLocale(admin.locale);
        await this.mail.send(
          cloudDatabaseFullEmail({
            to: admin.email,
            locale,
            project: db.project.name,
            database: db.name,
            maxBytes,
            url: `${this.config.cloudUrl}/${locale}/console/${db.project.team.slug}/${db.project.slug}?tab=databases`,
            siteUrl: this.config.siteUrl,
          }),
        );
      }
    } catch (error) {
      this.logger.error(`Database ${db.id}: the full email couldn't be sent: ${String(error)}`);
    }
  }
}
