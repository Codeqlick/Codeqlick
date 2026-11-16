import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Bbox } from './cruising.rules.js';

/** The contact's and member's details a timer's emails need. */
const timerSelect = {
  id: true,
  userId: true,
  endsAt: true,
  message: true,
  warnedAt: true,
  firedAt: true,
  endedAt: true,
  createdAt: true,
  spot: { select: { id: true, slug: true, name: true, lat: true, lng: true } },
} as const;

/** A testing centre as lists show it. */
const centerSelect = {
  id: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  countryCode: true,
  city: true,
  citySlug: true,
  url: true,
  phone: true,
  free: true,
  anonymous: true,
  rapid: true,
} as const;

/** Cruising's trusted contacts, timers, health fields and testing centres (phase 5). */
@Injectable()
export class CruisingSafetyRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Trusted contacts --------------------------------------------------------------------------

  contacts(userId: string) {
    return this.prisma.cruisingTrustedContact.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Pending and accepted contacts (the 2 a member can have); refused ones don't count. */
  countContacts(userId: string): Promise<number> {
    return this.prisma.cruisingTrustedContact.count({
      where: { userId, status: { not: 'REFUSED' } },
    });
  }

  async hasContact(userId: string, email: string): Promise<boolean> {
    const found = await this.prisma.cruisingTrustedContact.findFirst({
      where: { userId, email },
      select: { id: true },
    });
    return found !== null;
  }

  createContact(data: Prisma.CruisingTrustedContactUncheckedCreateInput) {
    return this.prisma.cruisingTrustedContact.create({ data });
  }

  /** Deletes one of my contacts unless they refused; false when there was none. */
  async deleteContact(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.cruisingTrustedContact.deleteMany({
      where: { id, userId, status: { not: 'REFUSED' } },
    });
    return count > 0;
  }

  findContact(id: string) {
    return this.prisma.cruisingTrustedContact.findUnique({ where: { id } });
  }

  findContactByInvite(inviteTokenHash: string) {
    return this.prisma.cruisingTrustedContact.findUnique({ where: { inviteTokenHash } });
  }

  /**
   * Records an answer to an invitation (its token is spent), only while it is still that token:
   * false when someone used it a moment earlier.
   */
  async answerInvite(
    id: string,
    inviteTokenHash: string,
    status: 'ACCEPTED' | 'REFUSED',
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.cruisingTrustedContact.updateMany({
      where: { id, inviteTokenHash },
      data: { status, inviteTokenHash: null, respondedAt: now },
    });
    return count > 0;
  }

  /** A contact stops: REFUSED for good, any pending invitation spent. */
  async stopContact(id: string, now: Date): Promise<void> {
    await this.prisma.cruisingTrustedContact.updateMany({
      where: { id },
      data: { status: 'REFUSED', inviteTokenHash: null, respondedAt: now },
    });
  }

  acceptedContacts(userId: string) {
    return this.prisma.cruisingTrustedContact.findMany({
      where: { userId, status: 'ACCEPTED' },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---- Timers ------------------------------------------------------------------------------------

  /** My timer that is neither ended nor fired. */
  activeTimer(userId: string) {
    return this.prisma.cruisingTimer.findFirst({
      where: { userId, endedAt: null, firedAt: null },
      orderBy: { createdAt: 'desc' },
      select: timerSelect,
    });
  }

  /**
   * Starts a timer, ending (`endedAt`) any earlier one still running in the same transaction: there
   * is only ever one active.
   */
  async startTimer(
    data: { userId: string; endsAt: Date; message: string | null; spotId: string | null },
    now: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.cruisingTimer.updateMany({
        where: { userId: data.userId, endedAt: null, firedAt: null },
        data: { endedAt: now },
      });
      return tx.cruisingTimer.create({ data: { ...data, createdAt: now }, select: timerSelect });
    });
  }

  /** Moves a running timer's end (and lets it warn again); null when it has ended or fired. */
  async extendTimer(id: string, endsAt: Date) {
    const { count } = await this.prisma.cruisingTimer.updateMany({
      where: { id, endedAt: null, firedAt: null },
      data: { endsAt, warnedAt: null },
    });
    if (count === 0) return null;
    return this.prisma.cruisingTimer.findUnique({ where: { id }, select: timerSelect });
  }

  /** Ends my running timers; returns how many there were. */
  async endTimers(userId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.cruisingTimer.updateMany({
      where: { userId, endedAt: null, firedAt: null },
      data: { endedAt: now },
    });
    return count;
  }

  /** Running timers that end before `until`: to warn or to fire. */
  timersEndingBefore(until: Date, take: number) {
    return this.prisma.cruisingTimer.findMany({
      where: { endedAt: null, firedAt: null, endsAt: { lte: until } },
      orderBy: { endsAt: 'asc' },
      take,
      select: {
        ...timerSelect,
        user: { select: { email: true, locale: true, cruisingProfile: true } },
      },
    });
  }

  /** Claims a timer's reminder; false when it was sent, ended or fired already (another run). */
  async claimWarning(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.cruisingTimer.updateMany({
      where: { id, warnedAt: null, endedAt: null, firedAt: null },
      data: { warnedAt: now },
    });
    return count > 0;
  }

  /** Claims a timer's expiry: true once, for the run that sends the emails. */
  async claimFiring(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.cruisingTimer.updateMany({
      where: { id, endedAt: null, firedAt: null, endsAt: { lte: now } },
      data: { firedAt: now },
    });
    return count > 0;
  }

  /** Deletes the timers that ended (by the member, or by running out) before `cutoff`. */
  async deleteTimersEndedBefore(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.cruisingTimer.deleteMany({
      where: {
        OR: [{ endedAt: { lt: cutoff } }, { endedAt: null, endsAt: { lt: cutoff } }],
      },
    });
    return count;
  }

  // ---- Sexual health -----------------------------------------------------------------------------

  saveHealth(
    userId: string,
    data: {
      healthConsentAt: Date;
      prepStatus: 'ON_PREP' | 'NOT_ON_PREP' | null;
      lastTestedMonth: string | null;
      healthVisible: boolean;
      reminderMonths: number | null;
    },
  ) {
    return this.prisma.cruisingProfile.update({ where: { userId }, data });
  }

  /** Turning health off deletes every field of it. */
  async clearHealth(userId: string): Promise<void> {
    await this.prisma.cruisingProfile.updateMany({
      where: { userId },
      data: {
        healthConsentAt: null,
        prepStatus: null,
        lastTestedMonth: null,
        healthVisible: false,
        reminderMonths: null,
        healthRemindedAt: null,
      },
    });
  }

  /** Members with reminders on (the service decides who is due). */
  healthReminderCandidates(cursor: string | undefined, take: number) {
    return this.prisma.cruisingProfile.findMany({
      where: {
        healthConsentAt: { not: null },
        reminderMonths: { not: null },
        lastTestedMonth: { not: null },
      },
      orderBy: { userId: 'asc' },
      ...(cursor ? { cursor: { userId: cursor }, skip: 1 } : {}),
      take,
      select: {
        userId: true,
        healthConsentAt: true,
        lastTestedMonth: true,
        reminderMonths: true,
        healthRemindedAt: true,
        emailAlerts: true,
        suspendedAt: true,
        suspendedUntil: true,
        termsVersion: true,
        user: { select: { email: true, locale: true } },
      },
    });
  }

  async markHealthReminded(userId: string, now: Date): Promise<void> {
    await this.prisma.cruisingProfile.update({
      where: { userId },
      data: { healthRemindedAt: now },
    });
  }

  // ---- Testing centres ---------------------------------------------------------------------------

  centersInBox(box: Bbox, take: number) {
    return this.prisma.cruisingHealthCenter.findMany({
      where: {
        lng: { gte: box.minLng, lte: box.maxLng },
        lat: { gte: box.minLat, lte: box.maxLat },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take,
      select: centerSelect,
    });
  }

  centersIn(where: { countryCode?: string; citySlug?: string }, take: number) {
    return this.prisma.cruisingHealthCenter.findMany({
      where,
      orderBy: [{ countryCode: 'asc' }, { citySlug: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take,
      select: centerSelect,
    });
  }

  async centerCityCounts() {
    const rows = await this.prisma.cruisingHealthCenter.groupBy({
      by: ['countryCode', 'citySlug', 'city'],
      _count: { _all: true },
    });
    return rows.map((row) => ({
      countryCode: row.countryCode,
      citySlug: row.citySlug,
      city: row.city,
      count: row._count._all,
    }));
  }

  adminCenters(q: string | undefined, take: number) {
    return this.prisma.cruisingHealthCenter.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { address: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: [{ countryCode: 'asc' }, { citySlug: 'asc' }, { name: 'asc' }],
      take,
      select: { ...centerSelect, createdAt: true, updatedAt: true },
    });
  }

  findCenter(id: string) {
    return this.prisma.cruisingHealthCenter.findUnique({ where: { id } });
  }

  createCenter(data: Prisma.CruisingHealthCenterCreateInput) {
    return this.prisma.cruisingHealthCenter.create({ data, select: { id: true } });
  }

  async createCenters(rows: Prisma.CruisingHealthCenterCreateManyInput[]): Promise<number> {
    const { count } = await this.prisma.cruisingHealthCenter.createMany({ data: rows });
    return count;
  }

  updateCenter(id: string, data: Prisma.CruisingHealthCenterUpdateInput) {
    return this.prisma.cruisingHealthCenter.update({ where: { id }, data });
  }

  async deleteCenter(id: string): Promise<boolean> {
    const { count } = await this.prisma.cruisingHealthCenter.deleteMany({ where: { id } });
    return count > 0;
  }

  /** Centres in a box, for the import's duplicate check. */
  async centersNear(box: Bbox) {
    const rows = await this.prisma.cruisingHealthCenter.findMany({
      where: {
        lat: { gte: box.minLat, lte: box.maxLat },
        lng: { gte: box.minLng, lte: box.maxLng },
      },
      select: { id: true, name: true, lat: true, lng: true },
    });
    return rows.map((row) => ({ ...row, lat: Number(row.lat), lng: Number(row.lng) }));
  }
}
