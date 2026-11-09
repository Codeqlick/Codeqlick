import { Injectable } from '@nestjs/common';
import type { MeetingRoom } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type RoomWithOwner = MeetingRoom & { owner: { name: string } };

@Injectable()
export class MeetingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The account's profile photo, if it has one. */
  async avatarOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    return user?.avatarKey ?? null;
  }

  listByOwner(ownerId: string): Promise<MeetingRoom[]> {
    return this.prisma.meetingRoom.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  countByOwner(ownerId: string): Promise<number> {
    return this.prisma.meetingRoom.count({ where: { ownerId } });
  }

  findById(id: string): Promise<MeetingRoom | null> {
    return this.prisma.meetingRoom.findUnique({ where: { id } });
  }

  findByCode(code: string): Promise<RoomWithOwner | null> {
    return this.prisma.meetingRoom.findUnique({
      where: { code },
      include: { owner: { select: { name: true } } },
    });
  }

  codeTaken(code: string): Promise<boolean> {
    return this.prisma.meetingRoom.count({ where: { code } }).then((count: number) => count > 0);
  }

  create(ownerId: string, code: string, title: string): Promise<MeetingRoom> {
    return this.prisma.meetingRoom.create({ data: { ownerId, code, title } });
  }

  update(id: string, data: { title?: string; lobby?: boolean }): Promise<MeetingRoom> {
    return this.prisma.meetingRoom.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.meetingRoom.delete({ where: { id } });
  }

  async touch(id: string, now: Date): Promise<void> {
    await this.prisma.meetingRoom.updateMany({ where: { id }, data: { lastUsedAt: now } });
  }
}
