import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { Booking } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { LeadsService } from '../leads/leads.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingTeamEmail,
} from './booking-emails.js';
import { freeSlots, madridDay, TIME_ZONE } from './booking-time.js';
import { BookingsRepository } from './bookings.repository.js';
import {
  bookingConfigSchema,
  DEFAULT_BOOKING,
  type BookingConfig,
  type CreateBookingInput,
} from './bookings.schemas.js';
import { callInvitation } from './ics.js';

export interface BookingView {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string | null;
  locale: ApiLocale;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  leadId: string | null;
  createdAt: string;
}

function toView(row: Booking): BookingView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    message: row.message,
    locale: toApiLocale(row.locale),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    leadId: row.leadId,
    createdAt: row.createdAt.toISOString(),
  };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Calls booked from the website in the team's free hours (Madrid time), held on a fixed Google Meet
 * link. Each booking emails both sides a calendar invitation and moves the lead to the CALL stage.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly repository: BookingsRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
    private readonly leads: LeadsService,
  ) {}

  async getConfig(): Promise<BookingConfig> {
    const parsed = bookingConfigSchema.safeParse(await this.repository.findConfig());
    return parsed.success ? parsed.data : DEFAULT_BOOKING;
  }

  async saveConfig(actor: AuthUser, config: BookingConfig): Promise<BookingConfig> {
    await this.repository.saveConfig(config);
    await this.activity.record(actor, {
      action: 'settings.booking_updated',
      targetLabel: 'Bookings',
      details: { enabled: config.enabled },
    });
    return config;
  }

  /** The free slots for the website; 404 until the team publishes the page. */
  async publicSlots(now = new Date()): Promise<{
    durationMinutes: number;
    timeZone: string;
    slots: string[];
  }> {
    const config = await this.publishedConfig();
    return {
      durationMinutes: config.durationMinutes,
      timeZone: TIME_ZONE,
      slots: (await this.slots(config, now)).map((slot) => slot.toISOString()),
    };
  }

  /** Books a free slot: 409 when it isn't free (any more). */
  async book(input: CreateBookingInput, now = new Date()) {
    const config = await this.publishedConfig();
    if (input.website && input.website.trim() !== '') {
      // Honeypot hit: pretend success so bots learn nothing.
      this.logger.warn('Booking honeypot triggered; request discarded');
      return { id: randomUUID(), startsAt: input.startsAt, meetingUrl: config.meetingUrl };
    }
    const startsAt = new Date(input.startsAt);
    const free = await this.slots(config, now);
    if (!free.some((slot) => slot.getTime() === startsAt.getTime())) {
      throw new ConflictException('That time is no longer free');
    }
    const endsAt = new Date(startsAt.getTime() + config.durationMinutes * 60_000);
    const token = randomBytes(24).toString('base64url');
    const lead = await this.leads.fromBooking({
      name: input.name,
      email: input.email,
      company: input.company || null,
      message: input.message || null,
      locale: input.locale,
      day: madridDay(startsAt),
    });
    let row: Booking;
    try {
      row = await this.repository.create({
        name: input.name,
        email: input.email.trim().toLowerCase(),
        company: input.company || null,
        message: input.message || null,
        locale: toDbLocale(input.locale),
        startsAt,
        endsAt,
        slotKey: startsAt,
        cancelTokenHash: hashToken(token),
        leadId: lead.id,
      });
    } catch {
      // The unique slot key: someone else booked it a moment ago.
      throw new ConflictException('That time is no longer free');
    }

    const cancelUrl = `${this.config.siteUrl}/${input.locale}/book/cancel?token=${token}`;
    this.send(
      bookingConfirmedEmail(
        row,
        config.meetingUrl,
        cancelUrl,
        input.locale,
        this.config.siteUrl,
        this.invitation(row, config.meetingUrl, 'REQUEST', input.locale),
      ),
    );
    this.send(
      bookingTeamEmail(
        this.config.leadsNotifyTo,
        row,
        `${this.config.siteUrl}/es/admin/bookings`,
        this.config.siteUrl,
        this.invitation(row, config.meetingUrl, 'REQUEST', 'en'),
      ),
    );
    await this.activity.record(
      { id: null, name: row.name },
      { action: 'booking.created', targetId: row.id, targetLabel: row.name },
    );
    return { id: row.id, startsAt: row.startsAt.toISOString(), meetingUrl: config.meetingUrl };
  }

  /** From the link in the visitor's email: cancels it and tells the team. */
  async cancelWithToken(token: string): Promise<{ startsAt: string }> {
    const booking = await this.repository.findByTokenHash(hashToken(token));
    if (!booking || booking.status !== 'CONFIRMED') {
      throw new NotFoundException('No booked call for this link');
    }
    const row = await this.repository.cancel(booking.id);
    if (!row) throw new NotFoundException('No booked call for this link');
    const config = await this.getConfig();
    this.send(
      bookingCancelledEmail(
        { email: this.config.leadsNotifyTo, name: 'Codeqlick' },
        row,
        true,
        'en',
        this.config.siteUrl,
        this.invitation(row, config.meetingUrl, 'CANCEL', 'en'),
      ),
    );
    await this.activity.record(
      { id: null, name: row.name },
      { action: 'booking.cancelled', targetId: row.id, targetLabel: row.name },
    );
    return { startsAt: row.startsAt.toISOString() };
  }

  /** By the team: the visitor is emailed in their language. */
  async cancelByTeam(actor: AuthUser, id: string): Promise<BookingView> {
    const row = await this.repository.cancel(id);
    if (!row) throw new NotFoundException('No confirmed call with this id');
    const config = await this.getConfig();
    const locale = toApiLocale(row.locale);
    this.send(
      bookingCancelledEmail(
        { email: row.email, name: row.name },
        row,
        false,
        locale,
        this.config.siteUrl,
        this.invitation(row, config.meetingUrl, 'CANCEL', locale),
      ),
    );
    await this.activity.record(actor, {
      action: 'booking.cancelled',
      targetId: row.id,
      targetLabel: row.name,
    });
    return toView(row);
  }

  async list(scope: 'upcoming' | 'past', now = new Date()): Promise<BookingView[]> {
    return (await this.repository.list(scope, now)).map(toView);
  }

  countUpcoming(now = new Date()): Promise<number> {
    return this.repository.countUpcoming(now);
  }

  // ---- Helpers --------------------------------------------------------------------------

  private async publishedConfig(): Promise<BookingConfig> {
    const config = await this.getConfig();
    if (!config.enabled) throw new NotFoundException('Bookings are not open');
    return config;
  }

  private async slots(config: BookingConfig, now: Date): Promise<Date[]> {
    return freeSlots({
      weekly: config.weekly,
      durationMinutes: config.durationMinutes,
      minNoticeHours: config.minNoticeHours,
      horizonDays: config.horizonDays,
      now,
      booked: await this.repository.confirmedFrom(now),
    });
  }

  private invitation(
    row: Booking,
    meetingUrl: string,
    method: 'REQUEST' | 'CANCEL',
    locale: ApiLocale,
  ): string {
    const es = locale === 'es';
    const from = /<([^>]+)>/.exec(this.config.mailFrom)?.[1] ?? this.config.mailFrom;
    return callInvitation({
      uid: `${row.id}@codeqlick.com`,
      sequence: row.sequence,
      method,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      summary: es ? 'Llamada con Codeqlick' : `Call with ${row.name} (Codeqlick)`,
      description: es
        ? `Videollamada por Google Meet: ${meetingUrl}`
        : `Google Meet: ${meetingUrl}${row.message ? `\n\n${row.message}` : ''}`,
      url: meetingUrl,
      organizer: { name: 'Codeqlick', email: from },
      attendee: { name: row.name, email: row.email },
    });
  }

  private send(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Booking email to ${message.to} failed: ${reason}`);
    });
  }
}
