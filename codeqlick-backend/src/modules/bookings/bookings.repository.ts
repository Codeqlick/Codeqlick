import { Injectable } from '@nestjs/common';
import type { Booking, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const KEY = 'booking';

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findConfig(): Promise<unknown> {
    return (await this.prisma.setting.findUnique({ where: { key: KEY } }))?.value ?? null;
  }

  async saveConfig(value: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
  }

  /** Confirmed calls ending after `from`, to keep their times out of the free slots. */
  confirmedFrom(from: Date): Promise<Pick<Booking, 'startsAt' | 'endsAt'>[]> {
    return this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', endsAt: { gt: from } },
      select: { startsAt: true, endsAt: true },
    });
  }

  create(data: Prisma.BookingUncheckedCreateInput): Promise<Booking> {
    return this.prisma.booking.create({ data });
  }

  findById(id: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({ where: { id } });
  }

  findByTokenHash(hash: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({ where: { cancelTokenHash: hash } });
  }

  /** Cancels a confirmed call; null when it wasn't confirmed any more. */
  async cancel(id: string): Promise<Booking | null> {
    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: {
        status: 'CANCELLED',
        slotKey: null,
        cancelledAt: new Date(),
        sequence: { increment: 1 },
      },
    });
    return count === 0 ? null : this.findById(id);
  }

  list(scope: 'upcoming' | 'past', now: Date): Promise<Booking[]> {
    return scope === 'upcoming'
      ? this.prisma.booking.findMany({
          where: { endsAt: { gt: now } },
          orderBy: { startsAt: 'asc' },
          take: 200,
        })
      : this.prisma.booking.findMany({
          where: { endsAt: { lte: now } },
          orderBy: { startsAt: 'desc' },
          take: 200,
        });
  }

  countUpcoming(now: Date): Promise<number> {
    return this.prisma.booking.count({ where: { status: 'CONFIRMED', endsAt: { gt: now } } });
  }
}
