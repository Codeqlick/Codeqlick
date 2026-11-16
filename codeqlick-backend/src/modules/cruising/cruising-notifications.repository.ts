import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationData, NotificationKind } from './cruising-notifications.rules.js';

/** What names a member in a list of winks or visitors. */
const personSelect = {
  cruisingProfile: {
    select: { nickname: true, suspendedAt: true, suspendedUntil: true, termsVersion: true },
  },
} as const;

/**
 * Cruising phase 6's data (architecture 4.15, decisions 97 and 98): winks, profile visits and the
 * notification centre.
 */
@Injectable()
export class CruisingNotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Notification centre -----------------------------------------------------------------------

  /** The unread notifications of these members that fold under `groupKey`. */
  unreadInGroup(userIds: string[], groupKey: string) {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.cruisingNotification.findMany({
      where: { userId: { in: userIds }, groupKey, readAt: null },
      select: { id: true, userId: true, data: true },
    });
  }

  createNotifications(
    rows: {
      userId: string;
      kind: NotificationKind;
      data: NotificationData;
      groupKey: string | null;
      createdAt: Date;
    }[],
  ) {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.cruisingNotification.createMany({ data: rows });
  }

  /** Brings unread grouped notifications to the top with their new data. */
  refreshNotifications(ids: string[], data: NotificationData, now: Date) {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.cruisingNotification.updateMany({
      where: { id: { in: ids } },
      data: { data: data as Prisma.InputJsonValue, createdAt: now },
    });
  }

  /** A member's notifications since `since`, newest first. */
  notifications(userId: string, since: Date, take: number) {
    return this.prisma.cruisingNotification.findMany({
      where: { userId, createdAt: { gt: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, kind: true, data: true, readAt: true, createdAt: true },
    });
  }

  /** Marks some (or, with no ids, all) of a member's notifications read. */
  markNotificationsRead(userId: string, ids: string[] | undefined, now: Date) {
    return this.prisma.cruisingNotification.updateMany({
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: now },
    });
  }

  /** Marks the unread notifications of a group read (a conversation just opened). */
  markGroupRead(userId: string, groupKey: string, now: Date) {
    return this.prisma.cruisingNotification.updateMany({
      where: { userId, groupKey, readAt: null },
      data: { readAt: now },
    });
  }

  deleteNotificationsOfKind(userId: string, kind: NotificationKind) {
    return this.prisma.cruisingNotification.deleteMany({ where: { userId, kind } });
  }

  async deleteNotificationsBefore(before: Date): Promise<number> {
    return (
      await this.prisma.cruisingNotification.deleteMany({ where: { createdAt: { lt: before } } })
    ).count;
  }

  /** Keeps each member's newest `max` notifications and deletes the rest. */
  trimNotifications(max: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM cruising_notifications AS n
      USING (
        SELECT id FROM (
          SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
          FROM cruising_notifications
        ) AS ranked
        WHERE ranked.rn > ${max}
      ) AS old
      WHERE n.id = old.id`;
  }

  /** The spots notifications point at, to name and link them. */
  spotsByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.cruisingSpot.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, name: true, status: true },
    });
  }

  // ---- Winks -------------------------------------------------------------------------------------

  countWinksSince(senderId: string, since: Date) {
    return this.prisma.cruisingWink.count({ where: { senderId, createdAt: { gt: since } } });
  }

  async winkedSince(senderId: string, recipientId: string, since: Date): Promise<boolean> {
    return (
      (await this.prisma.cruisingWink.count({
        where: { senderId, recipientId, createdAt: { gt: since } },
      })) > 0
    );
  }

  createWink(senderId: string, recipientId: string, now: Date) {
    return this.prisma.cruisingWink.create({ data: { senderId, recipientId, createdAt: now } });
  }

  /** The winks a member received since `since`, newest first, not from `excludeIds`. */
  winksReceived(recipientId: string, since: Date, excludeIds: string[], take: number) {
    return this.prisma.cruisingWink.findMany({
      where: { recipientId, createdAt: { gt: since }, senderId: { notIn: excludeIds } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { senderId: true, createdAt: true, sender: { select: personSelect } },
    });
  }

  /** Which of `recipientIds` the member winked at since `since`. */
  async winkedAt(senderId: string, recipientIds: string[], since: Date): Promise<Set<string>> {
    if (recipientIds.length === 0) return new Set();
    const rows = await this.prisma.cruisingWink.findMany({
      where: { senderId, recipientId: { in: recipientIds }, createdAt: { gt: since } },
      select: { recipientId: true },
    });
    return new Set(rows.map((row) => row.recipientId));
  }

  async deleteWinksBefore(before: Date): Promise<number> {
    return (await this.prisma.cruisingWink.deleteMany({ where: { createdAt: { lt: before } } }))
      .count;
  }

  // ---- Profile visits ----------------------------------------------------------------------------

  setShowVisits(userId: string, showVisits: boolean) {
    return this.prisma.cruisingProfile.update({ where: { userId }, data: { showVisits } });
  }

  /** Records a visit on `day`; returns whether it is the first of that viewer and profile that day. */
  async recordView(viewerId: string, viewedId: string, day: Date, now: Date): Promise<boolean> {
    const existing = await this.prisma.cruisingProfileView.updateMany({
      where: { viewerId, viewedId, day },
      data: { seenAt: now },
    });
    if (existing.count > 0) return false;
    const created = await this.prisma.cruisingProfileView.createMany({
      data: [{ viewerId, viewedId, day, seenAt: now }],
      skipDuplicates: true,
    });
    return created.count > 0;
  }

  /** Who opened a member's profile since `since`, newest first, not `excludeIds`. */
  visitors(viewedId: string, since: Date, excludeIds: string[], take: number) {
    return this.prisma.cruisingProfileView.findMany({
      where: { viewedId, seenAt: { gt: since }, viewerId: { notIn: excludeIds } },
      orderBy: { seenAt: 'desc' },
      take,
      select: { viewerId: true, seenAt: true, viewer: { select: personSelect } },
    });
  }

  /** Every visit a member made or received (turning visits off). */
  deleteViewsOf(userId: string) {
    return this.prisma.cruisingProfileView.deleteMany({
      where: { OR: [{ viewerId: userId }, { viewedId: userId }] },
    });
  }

  async deleteViewsBefore(day: Date): Promise<number> {
    return (await this.prisma.cruisingProfileView.deleteMany({ where: { day: { lt: day } } }))
      .count;
  }
}
