import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { CruisingNotificationsRepository } from './cruising-notifications.repository.js';
import {
  MAX_NOTIFICATIONS,
  mergeNotificationData,
  NOTIFICATION_KEEP_MS,
  notificationGroup,
  utcDay,
  VISIT_KEEP_MS,
  WINK_KEEP_MS,
  type NotificationData,
  type NotificationKind,
} from './cruising-notifications.rules.js';
import { CruisingRepository } from './cruising.repository.js';

export interface CruisingNotificationView {
  id: string;
  kind: NotificationKind;
  /** Ids, a status or a count: never a text or a person. */
  data: NotificationData;
  /** The spot it is about, while it is LIVE (only for the member it was written for). */
  spot: { slug: string; name: string } | null;
  read: boolean;
  at: string;
}

/**
 * The notification centre (architecture 4.15, decision 98): everything that happened to a member,
 * kept 30 days and at most 200. `notify` is the one helper every event goes through, next to the
 * push or email it already sends (and also when the member has neither); it never throws.
 */
@Injectable()
export class CruisingNotificationsService {
  private readonly logger = new Logger(CruisingNotificationsService.name);

  constructor(
    private readonly notifications: CruisingNotificationsRepository,
    private readonly repository: CruisingRepository,
    private readonly config: AppConfigService,
  ) {}

  /** Tells one member (see `notifyMany`). */
  notify(
    userId: string,
    kind: NotificationKind,
    data: NotificationData = {},
    now = new Date(),
  ): Promise<void> {
    return this.notifyMany([userId], kind, data, now);
  }

  /**
   * Writes the same notification for each member. An unread one of the same group (a conversation,
   * a spot's activity, the winks, the day's visits) is brought to the top instead, its count added.
   */
  async notifyMany(
    userIds: string[],
    kind: NotificationKind,
    data: NotificationData = {},
    now = new Date(),
  ): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    try {
      const groupKey = notificationGroup(kind, data, now);
      const existing = groupKey ? await this.notifications.unreadInGroup(ids, groupKey) : [];
      const folded = new Set<string>();
      for (const row of existing) {
        if (folded.has(row.userId)) continue;
        folded.add(row.userId);
        await this.notifications.refreshNotifications(
          [row.id],
          mergeNotificationData(kind, row.data, data),
          now,
        );
      }
      await this.notifications.createNotifications(
        ids
          .filter((id) => !folded.has(id))
          .map((userId) => ({
            userId,
            kind,
            data: mergeNotificationData(kind, null, data),
            groupKey,
            createdAt: now,
          })),
      );
    } catch (error) {
      this.logger.error(`Cruising notification not written: ${String(error)}`);
    }
  }

  /** A conversation was opened: its "new messages" notification is read. */
  async readConversation(userId: string, conversationId: string, now = new Date()): Promise<void> {
    await this.notifications.markGroupRead(userId, `message:${conversationId}`, now);
  }

  private async entered(userId: string): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
  }

  /** My notifications of the last 30 days, newest first, and how many are unread. */
  async list(
    userId: string,
    now = new Date(),
  ): Promise<{ items: CruisingNotificationView[]; unread: number }> {
    await this.entered(userId);
    const rows = await this.notifications.notifications(
      userId,
      new Date(now.getTime() - NOTIFICATION_KEEP_MS),
      MAX_NOTIFICATIONS,
    );
    const spotIds = [
      ...new Set(
        rows.flatMap((row) => {
          const spotId = (row.data as NotificationData | null)?.spotId;
          return typeof spotId === 'string' ? [spotId] : [];
        }),
      ),
    ];
    const spots = new Map(
      (await this.notifications.spotsByIds(spotIds))
        .filter((spot) => spot.status === 'LIVE')
        .map((spot) => [spot.id, { slug: spot.slug, name: spot.name }]),
    );
    const items = rows.map((row): CruisingNotificationView => {
      const data = (row.data ?? {}) as NotificationData;
      return {
        id: row.id,
        kind: row.kind,
        data,
        spot: typeof data.spotId === 'string' ? (spots.get(data.spotId) ?? null) : null,
        read: row.readAt !== null,
        at: row.createdAt.toISOString(),
      };
    });
    return { items, unread: items.filter((item) => !item.read).length };
  }

  /** Marks the given notifications, or all of them, read. */
  async markRead(userId: string, ids: string[] | undefined, now = new Date()): Promise<void> {
    await this.entered(userId);
    await this.notifications.markNotificationsRead(userId, ids, now);
  }

  /**
   * The hourly cleanup: notifications after 30 days and beyond each member's newest 200, winks
   * after 30 days, visits after 30 days.
   */
  async cleanup(now = new Date()): Promise<void> {
    try {
      await this.notifications.deleteNotificationsBefore(
        new Date(now.getTime() - NOTIFICATION_KEEP_MS),
      );
      await this.notifications.trimNotifications(MAX_NOTIFICATIONS);
      await this.notifications.deleteWinksBefore(new Date(now.getTime() - WINK_KEEP_MS));
      await this.notifications.deleteViewsBefore(utcDay(new Date(now.getTime() - VISIT_KEEP_MS)));
    } catch (error) {
      this.logger.error(`Cruising notification cleanup failed: ${String(error)}`);
    }
  }
}
