import { Injectable } from '@nestjs/common';
import type { Appointment, BookingPage, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type PageWithRoom = BookingPage & { meetingRoom: { code: string } | null };
export type PublicPageRow = PageWithRoom & { owner: { name: string; email: string } };
export type AppointmentRow = Appointment & {
  page: PageWithRoom & { owner: { name: string; email: string; locale: 'EN' | 'ES' } };
};

const withRoom = { meetingRoom: { select: { code: true } } } as const;
const withPage = {
  page: {
    include: {
      meetingRoom: { select: { code: true } },
      owner: { select: { name: true, email: true, locale: true } },
    },
  },
} as const;

@Injectable()
export class CitasRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPages(ownerId: string): Promise<PageWithRoom[]> {
    return this.prisma.bookingPage.findMany({
      where: { ownerId },
      include: withRoom,
      orderBy: { createdAt: 'asc' },
    });
  }

  countPages(ownerId: string): Promise<number> {
    return this.prisma.bookingPage.count({ where: { ownerId } });
  }

  findPage(id: string): Promise<PageWithRoom | null> {
    return this.prisma.bookingPage.findUnique({ where: { id }, include: withRoom });
  }

  findPageBySlug(slug: string): Promise<PublicPageRow | null> {
    return this.prisma.bookingPage.findUnique({
      where: { slug },
      include: { ...withRoom, owner: { select: { name: true, email: true } } },
    });
  }

  slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    return this.prisma.bookingPage
      .count({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) } })
      .then((count: number) => count > 0);
  }

  createPage(data: Prisma.BookingPageUncheckedCreateInput): Promise<PageWithRoom> {
    return this.prisma.bookingPage.create({ data, include: withRoom });
  }

  updatePage(id: string, data: Prisma.BookingPageUncheckedUpdateInput): Promise<PageWithRoom> {
    return this.prisma.bookingPage.update({ where: { id }, data, include: withRoom });
  }

  async deletePage(id: string): Promise<void> {
    await this.prisma.bookingPage.delete({ where: { id } });
  }

  /** The owner's confirmed appointments ending after `from`, on any of their pages. */
  busy(ownerId: string, from: Date): Promise<Pick<Appointment, 'startsAt' | 'endsAt'>[]> {
    return this.prisma.appointment.findMany({
      where: { ownerId, status: 'CONFIRMED', endsAt: { gt: from } },
      select: { startsAt: true, endsAt: true },
    });
  }

  /**
   * Books under a lock per owner, so two people can't take the same time: `isFree` runs inside the
   * transaction with the owner's appointments as they are then; null when the time isn't free.
   */
  async bookIfFree(
    ownerId: string,
    isFree: (busy: Pick<Appointment, 'startsAt' | 'endsAt'>[]) => boolean,
    data: Prisma.AppointmentUncheckedCreateInput,
    now: Date,
  ): Promise<Appointment | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`citas:${ownerId}`}))`;
      const busy = await tx.appointment.findMany({
        where: { ownerId, status: 'CONFIRMED', endsAt: { gt: now } },
        select: { startsAt: true, endsAt: true },
      });
      if (!isFree(busy)) return null;
      return tx.appointment.create({ data });
    });
  }

  findAppointment(id: string): Promise<AppointmentRow | null> {
    return this.prisma.appointment.findUnique({ where: { id }, include: withPage });
  }

  findByTokenHash(hash: string): Promise<AppointmentRow | null> {
    return this.prisma.appointment.findUnique({
      where: { cancelTokenHash: hash },
      include: withPage,
    });
  }

  /** Cancels a confirmed appointment; null when it wasn't confirmed any more. */
  async cancel(id: string, now: Date): Promise<AppointmentRow | null> {
    const { count } = await this.prisma.appointment.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelledAt: now, sequence: { increment: 1 } },
    });
    return count === 0 ? null : this.findAppointment(id);
  }

  listAppointments(
    ownerId: string,
    scope: 'upcoming' | 'past',
    now: Date,
  ): Promise<AppointmentRow[]> {
    return this.prisma.appointment.findMany({
      where: {
        ownerId,
        ...(scope === 'upcoming' ? { endsAt: { gt: now } } : { endsAt: { lte: now } }),
      },
      include: withPage,
      orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
      take: 200,
    });
  }

  /** Confirmed upcoming appointments per page. */
  async upcomingByPage(ownerId: string, now: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.appointment.findMany({
      where: { ownerId, status: 'CONFIRMED', endsAt: { gt: now } },
      select: { pageId: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.pageId, (counts.get(row.pageId) ?? 0) + 1);
    return counts;
  }
}
