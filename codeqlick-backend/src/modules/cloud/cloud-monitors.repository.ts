import { Injectable } from '@nestjs/common';
import type {
  CloudMonitor,
  CloudMonitorStatus,
  CloudStatusPage,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type MonitorWithTeam = CloudMonitor & { team: { slug: string; name: string } };

/** Cloud monitors, their checks and events, and status pages (architecture 4.13). */
@Injectable()
export class CloudMonitorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(teamId: string): Promise<CloudMonitor[]> {
    return this.prisma.cloudMonitor.findMany({ where: { teamId }, orderBy: { createdAt: 'asc' } });
  }

  /** `db` is a transaction's client when counted inside one (moving a project). */
  count(teamId: string, db: Prisma.TransactionClient = this.prisma): Promise<number> {
    return db.cloudMonitor.count({ where: { teamId } });
  }

  find(id: string): Promise<MonitorWithTeam | null> {
    return this.prisma.cloudMonitor.findUnique({
      where: { id },
      include: { team: { select: { slug: true, name: true } } },
    });
  }

  findByKey(key: string): Promise<MonitorWithTeam | null> {
    return this.prisma.cloudMonitor.findUnique({
      where: { key },
      include: { team: { select: { slug: true, name: true } } },
    });
  }

  create(data: Prisma.CloudMonitorUncheckedCreateInput): Promise<CloudMonitor> {
    return this.prisma.cloudMonitor.create({ data });
  }

  update(id: string, data: Prisma.CloudMonitorUncheckedUpdateInput): Promise<CloudMonitor> {
    return this.prisma.cloudMonitor.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.cloudMonitor.delete({ where: { id } });
  }

  async projectInTeam(projectId: string, teamId: string): Promise<boolean> {
    return (
      (await this.prisma.cloudProject.count({
        where: { id: projectId, teamId, deletedAt: null },
      })) > 0
    );
  }

  async membersAmong(teamId: string, userIds: string[]): Promise<string[]> {
    const rows = await this.prisma.cloudMember.findMany({
      where: { teamId, userId: { in: userIds } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  alertees(teamId: string, userIds: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true, cloudMemberships: { some: { teamId } } },
      select: { email: true, name: true, locale: true },
    });
  }

  // ── Checks and events ──────────────────────────────────────────────────────────────────────

  async check(
    monitorId: string,
    data: {
      ok: boolean;
      statusCode?: number | null;
      responseMs?: number | null;
      error?: string | null;
    },
    at: Date,
  ): Promise<void> {
    await this.prisma.cloudMonitorCheck.create({
      data: {
        monitorId,
        checkedAt: at,
        ok: data.ok,
        statusCode: data.statusCode ?? null,
        responseMs: data.responseMs ?? null,
        error: data.error?.slice(0, 300) ?? null,
      },
    });
  }

  async event(
    monitorId: string,
    status: CloudMonitorStatus,
    at: Date,
    error?: string | null,
  ): Promise<void> {
    await this.prisma.cloudMonitorEvent.create({
      data: { monitorId, status, at, error: error?.slice(0, 300) ?? null },
    });
  }

  checksSince(monitorId: string, since: Date) {
    return this.prisma.cloudMonitorCheck.findMany({
      where: { monitorId, checkedAt: { gte: since } },
      orderBy: { checkedAt: 'asc' },
      select: { checkedAt: true, ok: true, statusCode: true, responseMs: true, error: true },
    });
  }

  /** Events from `since`, plus the last one before it (the state the window starts in). */
  async eventsSince(monitorIds: string[], since: Date) {
    if (monitorIds.length === 0) return [];
    const [inside, before] = await Promise.all([
      this.prisma.cloudMonitorEvent.findMany({
        where: { monitorId: { in: monitorIds }, at: { gte: since } },
        orderBy: { at: 'asc' },
      }),
      this.prisma.$queryRaw<
        Array<{ monitor_id: string; status: CloudMonitorStatus; at: Date; error: string | null }>
      >`
        SELECT DISTINCT ON (monitor_id) monitor_id, status, at, error
        FROM cloud_monitor_events
        WHERE monitor_id = ANY(${monitorIds}::uuid[]) AND at < ${since}
        ORDER BY monitor_id, at DESC`,
    ]);
    return [
      ...before.map((row) => ({
        monitorId: row.monitor_id,
        status: row.status,
        at: row.at,
        error: row.error,
      })),
      ...inside.map((row) => ({
        monitorId: row.monitorId,
        status: row.status,
        at: row.at,
        error: row.error,
      })),
    ];
  }

  async deleteChecksBefore(date: Date): Promise<void> {
    await this.prisma.cloudMonitorCheck.deleteMany({ where: { checkedAt: { lt: date } } });
  }

  async deleteEventsBefore(date: Date): Promise<void> {
    await this.prisma.cloudMonitorEvent.deleteMany({ where: { at: { lt: date } } });
  }

  // ── The engine ─────────────────────────────────────────────────────────────────────────────

  /** HTTP monitors whose check is due. */
  dueHttp(before: Date, take: number): Promise<MonitorWithTeam[]> {
    return this.prisma.cloudMonitor.findMany({
      where: {
        kind: 'HTTP',
        enabled: true,
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: before } }],
      },
      include: { team: { select: { slug: true, name: true } } },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      take,
    });
  }

  /** Claims a check (false when another run took it). */
  async claim(id: string, previous: Date | null, at: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudMonitor.updateMany({
      where: { id, lastCheckedAt: previous },
      data: { lastCheckedAt: at },
    });
    return count > 0;
  }

  /**
   * Monitors DOWN whose current episode wasn't alerted (it began during a maintenance, or within
   * 15 minutes of the last down alert), no longer under a maintenance in progress, and whose last
   * down alert is older than `spacedBefore`.
   */
  async pendingDownAlerts(now: Date, spacedBefore: Date): Promise<MonitorWithTeam[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT m.id FROM cloud_monitors m
      WHERE m.status = 'DOWN' AND m.enabled
        AND (m.last_down_alert_at IS NULL
          OR (m.last_down_alert_at < m.status_since AND m.last_down_alert_at < ${spacedBefore}))
        AND NOT EXISTS (
          SELECT 1 FROM cloud_status_notices n
          WHERE n.team_id = m.team_id AND n.kind = 'MAINTENANCE' AND n.resolved_at IS NULL
            AND n.starts_at <= ${now} AND n.ends_at > ${now} AND m.id = ANY(n.monitor_ids))
      ORDER BY m.status_since
      LIMIT 50`;
    if (rows.length === 0) return [];
    return this.prisma.cloudMonitor.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: { team: { select: { slug: true, name: true } } },
    });
  }

  /** Claims a monitor's pending down alert (false when it was sent meanwhile or it came back). */
  async claimDownAlert(id: string, previous: Date | null, at: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudMonitor.updateMany({
      where: { id, status: 'DOWN', lastDownAlertAt: previous },
      data: { lastDownAlertAt: at },
    });
    return count > 0;
  }

  /** Heartbeats past their deadline that aren't down yet. */
  lateHeartbeats(now: Date): Promise<MonitorWithTeam[]> {
    return this.prisma.cloudMonitor.findMany({
      where: { kind: 'HEARTBEAT', enabled: true, deadlineAt: { lt: now }, status: { not: 'DOWN' } },
      include: { team: { select: { slug: true, name: true } } },
      take: 100,
    });
  }

  // ── Status pages ───────────────────────────────────────────────────────────────────────────

  statusPage(teamId: string): Promise<CloudStatusPage | null> {
    return this.prisma.cloudStatusPage.findUnique({ where: { teamId } });
  }

  saveStatusPage(
    teamId: string,
    data: { enabled: boolean; title: string; intro: string | null; items: Prisma.InputJsonValue },
  ) {
    return this.prisma.cloudStatusPage.upsert({
      where: { teamId },
      create: { teamId, ...data },
      update: data,
    });
  }

  publicPage(teamSlug: string) {
    return this.prisma.cloudStatusPage.findFirst({
      where: { enabled: true, team: { slug: teamSlug } },
      include: { team: { select: { id: true, name: true, slug: true } } },
    });
  }

  monitorsByIds(teamId: string, ids: string[]): Promise<CloudMonitor[]> {
    return this.prisma.cloudMonitor.findMany({ where: { teamId, id: { in: ids } } });
  }
}
