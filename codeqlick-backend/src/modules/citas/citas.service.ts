import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { freeSlots } from '../bookings/booking-time.js';
import { callInvitation } from '../bookings/ics.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { MeetingsService } from '../meetings/meetings.service.js';
import {
  appointmentCancelledEmail,
  appointmentConfirmedEmail,
  appointmentOwnerEmail,
  appointmentReminderEmail,
  type AppointmentFacts,
} from './citas-emails.js';
import {
  CitasRepository,
  type AppointmentRow,
  type PageWithRoom,
  type PublicPageRow,
} from './citas.repository.js';
import {
  CITAS_MAX_PAGES,
  parseWeekly,
  type CreateAppointmentInput,
  type CreatePageInput,
  type UpdatePageInput,
  type Weekly,
} from './citas.schemas.js';

export interface PageView {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  location: string;
  video: boolean;
  /** The Meetings room's code, when the page offers video. */
  meetingCode: string | null;
  askPhone: boolean;
  timeZone: string;
  weekly: Weekly;
  minNoticeHours: number;
  horizonDays: number;
  enabled: boolean;
  /** Confirmed appointments still to come. */
  upcoming: number;
  createdAt: string;
}

/** What anyone with the link sees, with the free times (none while the page is paused). */
export interface PublicPage {
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  location: string;
  video: boolean;
  askPhone: boolean;
  timeZone: string;
  ownerName: string;
  /** The owner's profile photo (file name), if they have one. */
  ownerAvatar: string | null;
  enabled: boolean;
  slots: string[];
}

export interface AppointmentView {
  id: string;
  page: { id: string; slug: string; title: string };
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  locale: ApiLocale;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  status: 'CONFIRMED' | 'CANCELLED';
  cancelledAt: string | null;
  createdAt: string;
}

/** What the person who booked sees: after booking and from the cancel link. */
export interface BookedView {
  id: string;
  slug: string;
  title: string;
  ownerName: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  location: string;
  /** The Meetings room's code, when there is a video call. */
  meetingCode: string | null;
  status: 'CONFIRMED' | 'CANCELLED';
}

/** The reminder goes out about this long before the start. */
export const REMINDER_LEAD_HOURS = 24;
/** No reminder when it would arrive less than this before the start (nothing left to plan). */
const REMINDER_MIN_HOURS = 2;
/** No reminder for appointments booked this close to their start: the confirmation is fresh. */
const REMINDER_FRESH_BOOKING_HOURS = 26;
const HOUR_MS = 3_600_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Citas (architecture 4.9): people publish booking pages at citas.codeqlick.com and anyone books a
 * free time on them, without an account. Both sides get the emails and a calendar invitation.
 */
@Injectable()
export class CitasService {
  private readonly logger = new Logger(CitasService.name);

  constructor(
    private readonly repository: CitasRepository,
    private readonly meetings: MeetingsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  // ---- The owner's pages ------------------------------------------------------------------

  async listPages(ownerId: string, now = new Date()): Promise<PageView[]> {
    const [pages, upcoming] = await Promise.all([
      this.repository.listPages(ownerId),
      this.repository.upcomingByPage(ownerId, now),
    ]);
    return pages.map((page) => this.pageView(page, upcoming.get(page.id) ?? 0));
  }

  async createPage(ownerId: string, input: CreatePageInput): Promise<PageView> {
    if ((await this.repository.countPages(ownerId)) >= CITAS_MAX_PAGES) {
      throw new ConflictException(`At most ${CITAS_MAX_PAGES} booking pages per account`);
    }
    await this.assertSlugFree(input.slug);
    const meetingRoomId = input.video ? await this.newRoom(ownerId, input.title) : null;
    const { video: _video, weekly, ...fields } = input;
    try {
      const page = await this.repository.createPage({
        ...fields,
        weekly: weekly as Prisma.InputJsonValue,
        ownerId,
        meetingRoomId,
      });
      return this.pageView(page, 0);
    } catch {
      // The unique slug: someone took it a moment ago.
      throw new ConflictException('That link is taken');
    }
  }

  async updatePage(
    ownerId: string,
    id: string,
    input: UpdatePageInput,
    now = new Date(),
  ): Promise<PageView> {
    const page = await this.ownPage(ownerId, id);
    if (input.slug !== undefined && input.slug !== page.slug)
      await this.assertSlugFree(input.slug, id);
    const { video, weekly, ...fields } = input;
    const data: Prisma.BookingPageUncheckedUpdateInput = { ...fields };
    if (weekly !== undefined) data.weekly = weekly as Prisma.InputJsonValue;
    if (video === true && !page.meetingRoomId) {
      data.meetingRoomId = await this.newRoom(ownerId, input.title ?? page.title);
    } else if (video === false) {
      // The room stays in the owner's Meetings; the page just stops offering it.
      data.meetingRoomId = null;
    }
    let updated: PageWithRoom;
    try {
      updated = await this.repository.updatePage(id, data);
    } catch {
      throw new ConflictException('That link is taken');
    }
    const upcoming = await this.repository.upcomingByPage(ownerId, now);
    return this.pageView(updated, upcoming.get(id) ?? 0);
  }

  /** Deletes the page; its appointments still to come are cancelled and the people told first. */
  async deletePage(ownerId: string, id: string, now = new Date()): Promise<void> {
    await this.ownPage(ownerId, id);
    const upcoming = await this.repository.listAppointments(ownerId, 'upcoming', now);
    for (const appointment of upcoming) {
      if (appointment.pageId === id && appointment.status === 'CONFIRMED') {
        await this.cancel(appointment.id, 'owner', now);
      }
    }
    await this.repository.deletePage(id);
  }

  // ---- The owner's appointments -------------------------------------------------------------

  async listAppointments(
    ownerId: string,
    scope: 'upcoming' | 'past',
    now = new Date(),
  ): Promise<AppointmentView[]> {
    return (await this.repository.listAppointments(ownerId, scope, now)).map((row) =>
      this.appointmentView(row),
    );
  }

  /** The owner cancels: whoever booked is emailed in their language. */
  async cancelByOwner(ownerId: string, id: string, now = new Date()): Promise<AppointmentView> {
    const appointment = await this.repository.findAppointment(id);
    if (!appointment || appointment.ownerId !== ownerId) {
      throw new NotFoundException('Appointment not found');
    }
    return this.appointmentView(await this.cancel(id, 'owner', now));
  }

  // ---- Public ----------------------------------------------------------------------------------

  async publicPage(slug: string, now = new Date()): Promise<PublicPage> {
    const page = await this.repository.findPageBySlug(slug);
    if (!page) throw new NotFoundException('Booking page not found');
    const slots = page.enabled
      ? this.slots(page, await this.repository.busy(page.ownerId, now), now)
      : [];
    return {
      slug: page.slug,
      title: page.title,
      description: page.description,
      durationMinutes: page.durationMinutes,
      location: page.location,
      video: page.meetingRoom !== null,
      askPhone: page.askPhone,
      timeZone: page.timeZone,
      ownerName: page.owner.name,
      ownerAvatar: page.owner.avatarKey,
      enabled: page.enabled,
      slots: slots.map((slot) => slot.toISOString()),
    };
  }

  /** Books one of the free times: 409 when it isn't free (any more), 400 without a needed phone. */
  async book(slug: string, input: CreateAppointmentInput, now = new Date()): Promise<BookedView> {
    const page = await this.repository.findPageBySlug(slug);
    if (!page) throw new NotFoundException('Booking page not found');
    if (!page.enabled) throw new ConflictException('This page takes no bookings now');
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + page.durationMinutes * 60_000);
    if (input.website && input.website.trim() !== '') {
      // Honeypot hit: pretend it worked so bots learn nothing.
      this.logger.warn('Citas honeypot triggered; booking discarded');
      return this.bookedView(page, { id: randomUUID(), startsAt, endsAt, status: 'CONFIRMED' });
    }
    const phone = input.phone?.trim() || null;
    if (page.askPhone && !phone) {
      throw new BadRequestException('A phone number is needed for this booking');
    }
    const token = randomBytes(24).toString('base64url');
    const created = await this.repository.bookIfFree(
      page.ownerId,
      (busy) => this.slots(page, busy, now).some((slot) => slot.getTime() === startsAt.getTime()),
      {
        pageId: page.id,
        ownerId: page.ownerId,
        name: input.name,
        email: input.email.trim().toLowerCase(),
        phone,
        note: input.note?.trim() || null,
        locale: toDbLocale(input.locale),
        startsAt,
        endsAt,
        cancelTokenHash: hashToken(token),
      },
      now,
    );
    if (!created) throw new ConflictException('That time is no longer free');
    const row = await this.repository.findAppointment(created.id);
    if (row) this.notifyBooked(row, token, input.locale);
    return this.bookedView(page, created);
  }

  /** From the link in the confirmation email: what the appointment is. */
  async byToken(token: string): Promise<BookedView> {
    const row = await this.repository.findByTokenHash(hashToken(token));
    if (!row) throw new NotFoundException('No appointment for this link');
    return this.bookedView(row.page, row);
  }

  /** From the link in the confirmation email: cancels it and tells the owner. */
  async cancelWithToken(token: string, now = new Date()): Promise<BookedView> {
    const row = await this.repository.findByTokenHash(hashToken(token));
    if (!row) throw new NotFoundException('No appointment for this link');
    if (row.status === 'CANCELLED') return this.bookedView(row.page, row);
    const cancelled = await this.cancel(row.id, 'booker', now);
    return this.bookedView(cancelled.page, cancelled);
  }

  // ---- Reminders -------------------------------------------------------------------------------

  /**
   * Emails whoever booked about 24 h before each confirmed appointment, once (claimed in the
   * database, so overlapping runs can't send it twice). Returns how many went out.
   */
  async sendReminders(now = new Date()): Promise<number> {
    const due = await this.repository.dueReminders(
      new Date(now.getTime() + REMINDER_MIN_HOURS * HOUR_MS),
      new Date(now.getTime() + REMINDER_LEAD_HOURS * HOUR_MS),
    );
    let sent = 0;
    for (const row of due) {
      const bookedAhead = row.startsAt.getTime() - row.createdAt.getTime();
      if (bookedAhead < REMINDER_FRESH_BOOKING_HOURS * HOUR_MS) continue;
      if (!(await this.repository.claimReminder(row.id, now))) continue;
      const locale = toApiLocale(row.locale);
      this.send(
        appointmentReminderEmail(
          this.facts(row, locale),
          locale,
          this.config.siteUrl,
          this.pageUrl(row.page.slug, locale),
        ),
      );
      sent += 1;
    }
    return sent;
  }

  // ---- Helpers ---------------------------------------------------------------------------------

  /** Cancels a confirmed appointment that hasn't ended and emails the other side. */
  private async cancel(id: string, by: 'owner' | 'booker', now: Date): Promise<AppointmentRow> {
    const current = await this.repository.findAppointment(id);
    if (!current) throw new NotFoundException('Appointment not found');
    if (current.endsAt <= now) throw new ConflictException('That appointment is over');
    const row = await this.repository.cancel(id, now);
    if (!row) throw new ConflictException('That appointment was already cancelled');
    const ownerLocale = toApiLocale(row.page.owner.locale);
    const bookerLocale = toApiLocale(row.locale);
    const locale = by === 'owner' ? bookerLocale : ownerLocale;
    this.send(
      appointmentCancelledEmail(
        this.facts(row, locale),
        by === 'owner' ? 'booker' : 'owner',
        locale,
        this.config.siteUrl,
        this.invitation(row, 'CANCEL', locale),
        this.pageUrl(row.page.slug, bookerLocale),
      ),
    );
    return row;
  }

  private notifyBooked(row: AppointmentRow, token: string, locale: ApiLocale): void {
    const ownerLocale = toApiLocale(row.page.owner.locale);
    const cancelUrl = `${this.citasUrl()}/${locale}/cancelar?token=${token}`;
    this.send(
      appointmentConfirmedEmail(
        this.facts(row, locale),
        cancelUrl,
        locale,
        this.config.siteUrl,
        this.invitation(row, 'REQUEST', locale),
      ),
    );
    this.send(
      appointmentOwnerEmail(
        this.facts(row, ownerLocale),
        `${this.citasUrl()}/${ownerLocale}`,
        ownerLocale,
        this.config.siteUrl,
        this.invitation(row, 'REQUEST', ownerLocale),
      ),
    );
  }

  private facts(row: AppointmentRow, locale: ApiLocale): AppointmentFacts {
    return {
      pageTitle: row.page.title,
      ownerName: row.page.owner.name,
      ownerEmail: row.page.owner.email,
      name: row.name,
      email: row.email,
      phone: row.phone,
      note: row.note,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      timeZone: row.page.timeZone,
      location: row.page.location,
      videoUrl: row.page.meetingRoom ? this.videoUrl(row.page.meetingRoom.code, locale) : null,
    };
  }

  private invitation(row: AppointmentRow, method: 'REQUEST' | 'CANCEL', locale: ApiLocale): string {
    const facts = this.facts(row, locale);
    const from = /<([^>]+)>/.exec(this.config.mailFrom)?.[1] ?? this.config.mailFrom;
    const description = [
      facts.location,
      facts.videoUrl ? `${locale === 'es' ? 'Videollamada' : 'Video call'}: ${facts.videoUrl}` : '',
      row.note ?? '',
    ]
      .filter((line) => line !== '')
      .join('\n\n');
    return callInvitation({
      uid: `${row.id}@citas.codeqlick.com`,
      sequence: row.sequence,
      method,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      summary: `${row.page.title} · ${row.page.owner.name} & ${row.name}`,
      description,
      url: facts.videoUrl ?? undefined,
      location: facts.location || undefined,
      organizer: { name: row.page.owner.name, email: from },
      attendee: { name: row.name, email: row.email },
    });
  }

  /** The free start times of a page, given the owner's busy appointments. */
  private slots(page: PageWithRoom, busy: { startsAt: Date; endsAt: Date }[], now: Date): Date[] {
    return freeSlots({
      weekly: parseWeekly(page.weekly),
      durationMinutes: page.durationMinutes,
      minNoticeHours: page.minNoticeHours,
      horizonDays: page.horizonDays,
      timeZone: page.timeZone,
      now,
      booked: busy,
    });
  }

  private async newRoom(ownerId: string, title: string): Promise<string> {
    return (await this.meetings.createRoom(ownerId, { title })).id;
  }

  private async assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    if (await this.repository.slugTaken(slug, exceptId)) {
      throw new ConflictException('That link is taken');
    }
  }

  private async ownPage(ownerId: string, id: string): Promise<PageWithRoom> {
    const page = await this.repository.findPage(id);
    if (!page || page.ownerId !== ownerId) throw new NotFoundException('Booking page not found');
    return page;
  }

  private citasUrl(): string {
    return this.config.webappUrl('citas');
  }

  private pageUrl(slug: string, locale: ApiLocale): string {
    return `${this.citasUrl()}/${locale}/${slug}`;
  }

  private videoUrl(code: string, locale: ApiLocale): string {
    return `${this.config.webappUrl('meetings')}/${locale}/${code}`;
  }

  private pageView(page: PageWithRoom, upcoming: number): PageView {
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      description: page.description,
      durationMinutes: page.durationMinutes,
      location: page.location,
      video: page.meetingRoom !== null,
      meetingCode: page.meetingRoom?.code ?? null,
      askPhone: page.askPhone,
      timeZone: page.timeZone,
      weekly: parseWeekly(page.weekly),
      minNoticeHours: page.minNoticeHours,
      horizonDays: page.horizonDays,
      enabled: page.enabled,
      upcoming,
      createdAt: page.createdAt.toISOString(),
    };
  }

  private appointmentView(row: AppointmentRow): AppointmentView {
    return {
      id: row.id,
      page: { id: row.page.id, slug: row.page.slug, title: row.page.title },
      name: row.name,
      email: row.email,
      phone: row.phone,
      note: row.note,
      locale: toApiLocale(row.locale),
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timeZone: row.page.timeZone,
      status: row.status,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private bookedView(
    page: PublicPageRow | AppointmentRow['page'],
    appointment: { id: string; startsAt: Date; endsAt: Date; status: 'CONFIRMED' | 'CANCELLED' },
  ): BookedView {
    return {
      id: appointment.id,
      slug: page.slug,
      title: page.title,
      ownerName: page.owner.name,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      timeZone: page.timeZone,
      location: page.location,
      meetingCode: page.meetingRoom?.code ?? null,
      status: appointment.status,
    };
  }

  private send(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Citas email to ${message.to} failed: ${reason}`);
    });
  }
}
