import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { CruisingPushService } from './cruising-push.service.js';
import type { CruisingSafetyRepository } from './cruising-safety.repository.js';
import { hashToken, makeStopToken } from './cruising-safety.rules.js';
import { CruisingSafetyService } from './cruising-safety.service.js';
import type { CruisingRepository } from './cruising.repository.js';

const NOW = new Date('2026-11-16T20:00:00.000Z');
const VERSION = '2026-11-15.1';
const SECRET = 'a-secret-of-at-least-thirty-two-characters!';
const ME = '11111111-1111-4111-8111-111111111111';
const CONTACT = '22222222-2222-4222-8222-222222222222';
const SPOT = '33333333-3333-4333-8333-333333333333';
const TIMER = '44444444-4444-4444-8444-444444444444';
const NICKNAME = 'secret_nick';
const user = { id: ME, email: 'me@example.com', name: 'Me', role: 'CLIENT' } as AuthUser;
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

const profile = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  termsVersion: VERSION,
  nickname: NICKNAME,
  suspendedAt: null,
  suspendedUntil: null,
  emailAlerts: true,
  healthConsentAt: null,
  prepStatus: null,
  lastTestedMonth: null,
  healthVisible: false,
  reminderMonths: null,
  healthRemindedAt: null,
  ...over,
});

const contact = (over: Record<string, unknown> = {}) => ({
  id: CONTACT,
  userId: ME,
  email: 'friend@example.com',
  displayName: 'Luis',
  locale: 'ES',
  status: 'ACCEPTED',
  inviteTokenHash: null,
  respondedAt: NOW,
  createdAt: NOW,
  ...over,
});

const runningTimer = (over: Record<string, unknown> = {}) => ({
  id: TIMER,
  userId: ME,
  endsAt: minutes(-1),
  message: 'Meeting someone at the beach',
  warnedAt: minutes(-11),
  firedAt: null,
  endedAt: null,
  createdAt: minutes(-61),
  spot: null,
  user: { email: 'me@example.com', locale: 'EN', cruisingProfile: profile() },
  ...over,
});

function build() {
  const sent: MailMessage[] = [];
  const repo = {
    contacts: vi.fn().mockResolvedValue([]),
    countContacts: vi.fn().mockResolvedValue(0),
    hasContact: vi.fn().mockResolvedValue(false),
    createContact: vi.fn((args: { data?: unknown } & Record<string, unknown>) =>
      Promise.resolve(contact({ ...args, id: CONTACT, status: 'PENDING', createdAt: NOW })),
    ),
    deleteContact: vi.fn().mockResolvedValue(true),
    findContact: vi.fn().mockResolvedValue(contact()),
    findContactByInvite: vi.fn().mockResolvedValue(null),
    answerInvite: vi.fn().mockResolvedValue(true),
    stopContact: vi.fn().mockResolvedValue(undefined),
    acceptedContacts: vi.fn().mockResolvedValue([contact()]),
    activeTimer: vi.fn().mockResolvedValue(null),
    startTimer: vi.fn((data: Record<string, unknown>) =>
      Promise.resolve({
        id: TIMER,
        endsAt: data.endsAt,
        createdAt: NOW,
        message: data.message,
        warnedAt: null,
        spot: data.spotId ? { id: SPOT, slug: 'the-cove', name: 'The cove' } : null,
      }),
    ),
    extendTimer: vi.fn(),
    endTimers: vi.fn().mockResolvedValue(1),
    timersEndingBefore: vi.fn().mockResolvedValue([]),
    claimWarning: vi.fn().mockResolvedValue(true),
    claimFiring: vi.fn().mockResolvedValue(true),
    deleteTimersEndedBefore: vi.fn().mockResolvedValue(0),
    saveHealth: vi.fn((_userId: string, data: Record<string, unknown>) =>
      Promise.resolve(profile(data)),
    ),
    clearHealth: vi.fn().mockResolvedValue(undefined),
    healthReminderCandidates: vi.fn().mockResolvedValue([]),
    markHealthReminded: vi.fn().mockResolvedValue(undefined),
  };
  const cruising = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    recipient: vi.fn().mockResolvedValue({ id: ME, email: 'me@example.com', locale: 'ES' }),
    findSpot: vi.fn().mockResolvedValue({ id: SPOT, status: 'LIVE' }),
  };
  const push = {
    enabled: true,
    hasDevice: vi.fn().mockResolvedValue(false),
    notifyWith: vi.fn().mockResolvedValue(1),
  };
  const mail = {
    send: vi.fn((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const activity = { record: vi.fn().mockResolvedValue(undefined) };
  const config = {
    isTest: true,
    cruisingTermsVersion: VERSION,
    jwtAccessSecret: SECRET,
    siteUrl: 'https://codeqlick.com',
    webappUrl: () => 'https://cruising.codeqlick.com',
  };
  const service = new CruisingSafetyService(
    repo as unknown as CruisingSafetyRepository,
    cruising as unknown as CruisingRepository,
    push as unknown as CruisingPushService,
    mail as unknown as MailService,
    activity as unknown as ActivityService,
    config as unknown as AppConfigService,
  );
  return { service, repo, cruising, push, sent };
}

let t: ReturnType<typeof build>;
beforeEach(() => {
  t = build();
});

describe('trusted contacts', () => {
  it('invites by email in the member language, naming them as they chose', async () => {
    const view = await t.service.addContact(
      user,
      { email: 'friend@example.com', displayName: 'Luis' },
      NOW,
    );
    expect(view).toMatchObject({ email: 'f***@example.com', displayName: 'Luis' });
    const saved = t.repo.createContact.mock.calls[0]![0] as unknown as Record<string, string>;
    expect(saved.locale).toBe('ES');
    expect(saved.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const [email] = t.sent;
    expect(email?.to).toBe('friend@example.com');
    expect(email?.subject).toBe('Luis te pide recibir sus alertas de seguridad de Codeqlick');
    // Never the app, the nickname or the raw token's hash; the stop link is in it.
    for (const body of [email!.text, email!.html]) {
      expect(body).not.toMatch(/cruising/i);
      expect(body).not.toContain(NICKNAME);
      expect(body).not.toContain(saved.inviteTokenHash);
    }
    expect(email!.text).toContain('https://codeqlick.com/es/safety-contact?token=');
    expect(email!.text).toContain(encodeURIComponent(makeStopToken(CONTACT, SECRET)));
  });

  it('takes at most 2, not yourself, not twice', async () => {
    const input = { email: 'friend@example.com', displayName: 'Luis' };
    await expect(
      t.service.addContact(user, { ...input, email: 'me@example.com' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    t.repo.hasContact.mockResolvedValueOnce(true);
    await expect(t.service.addContact(user, input, NOW)).rejects.toBeInstanceOf(ConflictException);
    t.repo.countContacts.mockResolvedValueOnce(2);
    await expect(t.service.addContact(user, input, NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(t.sent).toHaveLength(0);
  });

  it('keeps one who refused, so they are never asked again', async () => {
    t.repo.findContact.mockResolvedValueOnce(contact({ status: 'REFUSED' }));
    await expect(t.service.deleteContact(ME, CONTACT)).rejects.toBeInstanceOf(ConflictException);
    t.repo.findContact.mockResolvedValueOnce(contact({ userId: CONTACT }));
    await expect(t.service.deleteContact(ME, CONTACT)).rejects.toBeInstanceOf(NotFoundException);
    await t.service.deleteContact(ME, CONTACT);
    expect(t.repo.deleteContact).toHaveBeenCalledWith(CONTACT, ME);
  });

  it('accepts or refuses with the single-use token', async () => {
    t.repo.findContactByInvite.mockResolvedValue(contact({ status: 'PENDING' }));
    await t.service.respond({ token: 'invitation-token-value', accept: true }, NOW);
    expect(t.repo.answerInvite).toHaveBeenCalledWith(
      CONTACT,
      hashToken('invitation-token-value'),
      'ACCEPTED',
      NOW,
    );
    t.repo.findContactByInvite.mockResolvedValue(null);
    await expect(
      t.service.respond({ token: 'invitation-token-value', accept: true }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stops with a signed stop token, never accepts with one', async () => {
    const token = makeStopToken(CONTACT, SECRET);
    await t.service.respond({ token, accept: false }, NOW);
    expect(t.repo.stopContact).toHaveBeenCalledWith(CONTACT, NOW);
    await expect(t.service.respond({ token, accept: true }, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      t.service.respond({ token: `${token.slice(0, -2)}xx`, accept: false }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the timer', () => {
  it('needs a contact who accepted, a clean message and a LIVE spot to share', async () => {
    await expect(
      t.service.startTimer(
        ME,
        { minutes: 60, message: 'call me on 612 345 678', shareSpot: false },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    t.repo.acceptedContacts.mockResolvedValueOnce([]);
    await expect(
      t.service.startTimer(ME, { minutes: 60, message: null, shareSpot: false }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    t.cruising.findSpot.mockResolvedValueOnce({ id: SPOT, status: 'HIDDEN' });
    await expect(
      t.service.startTimer(ME, { minutes: 60, message: null, shareSpot: true, spotId: SPOT }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('starts with the chosen end and only keeps the spot when shared', async () => {
    const view = await t.service.startTimer(
      ME,
      { minutes: 90, message: 'Beach', shareSpot: false, spotId: SPOT },
      NOW,
    );
    expect(view).toMatchObject({ endsAt: minutes(90).toISOString(), shareSpot: false, spot: null });
    expect(t.repo.startTimer).toHaveBeenCalledWith(
      { userId: ME, endsAt: minutes(90), message: 'Beach', spotId: null },
      NOW,
    );
    const shared = await t.service.startTimer(
      ME,
      { minutes: 30, message: null, shareSpot: true, spotId: SPOT },
      NOW,
    );
    expect(shared).toMatchObject({ shareSpot: true, spot: { name: 'The cove' } });
  });

  it('extends up to 6 hours from now', async () => {
    t.repo.activeTimer.mockResolvedValue({ ...runningTimer(), endsAt: minutes(330) });
    await expect(t.service.extendTimer(ME, { minutes: 60 }, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    t.repo.extendTimer.mockResolvedValue({ ...runningTimer(), endsAt: minutes(360) });
    await t.service.extendTimer(ME, { minutes: 30 }, NOW);
    expect(t.repo.extendTimer).toHaveBeenCalledWith(TIMER, minutes(360));
  });

  it('warns the member by push when they have a device, else by email', async () => {
    t.repo.timersEndingBefore.mockResolvedValue([
      runningTimer({ endsAt: minutes(8), warnedAt: null }),
    ]);
    t.push.hasDevice.mockResolvedValueOnce(true);
    expect(await t.service.checkTimers(NOW)).toEqual({ warned: 1, fired: 0 });
    expect(t.push.notifyWith).toHaveBeenCalledTimes(1);
    expect(t.sent).toHaveLength(0);
    expect(await t.service.checkTimers(NOW)).toEqual({ warned: 1, fired: 0 });
    expect(t.sent[0]?.subject).toBe('Your safety timer ends in 10 minutes — Cruising');
  });

  it('emails each accepted contact once when it runs out, the spot only when shared', async () => {
    t.repo.timersEndingBefore.mockResolvedValue([runningTimer()]);
    t.repo.acceptedContacts.mockResolvedValue([
      contact(),
      contact({ id: SPOT, email: 'other@example.com', locale: 'EN', displayName: 'L.' }),
    ]);
    expect(await t.service.checkTimers(NOW)).toEqual({ warned: 0, fired: 1 });
    expect(t.repo.claimFiring).toHaveBeenCalledWith(TIMER, NOW);
    expect(t.sent.map((each) => each.to)).toEqual(['friend@example.com', 'other@example.com']);
    const [es, en] = t.sent;
    expect(es?.subject).toBe(
      'Alerta de seguridad de Codeqlick: Luis no ha confirmado que está bien',
    );
    expect(en?.subject).toBe("Codeqlick safety alert: L. hasn't checked in");
    expect(en!.text).toContain('Meeting someone at the beach');
    expect(en!.text).toContain('16 November 2026 at 19:59 UTC');
    expect(en!.text).not.toContain('openstreetmap');
    expect(en!.text).not.toMatch(/cruising/i);
    expect(en!.text).not.toContain(NICKNAME);
    expect(en!.text).toContain(encodeURIComponent(makeStopToken(SPOT, SECRET)));

    t.sent.length = 0;
    t.repo.acceptedContacts.mockResolvedValue([contact({ locale: 'EN' })]);
    t.repo.timersEndingBefore.mockResolvedValue([
      runningTimer({
        spot: { id: SPOT, slug: 'the-cove', name: 'The cove', lat: 40.4, lng: -3.7 },
      }),
    ]);
    await t.service.checkTimers(NOW);
    expect(t.sent[0]!.text).toContain('The cove');
    expect(t.sent[0]!.text).toContain(
      'https://www.openstreetmap.org/?mlat=40.4&mlon=-3.7#map=17/40.4/-3.7',
    );
  });

  it('sends nothing when another run claimed it first', async () => {
    t.repo.timersEndingBefore.mockResolvedValue([runningTimer()]);
    t.repo.claimFiring.mockResolvedValue(false);
    expect(await t.service.checkTimers(NOW)).toEqual({ warned: 0, fired: 0 });
    expect(t.sent).toHaveLength(0);
  });
});

describe('sexual health', () => {
  const input = {
    enabled: true as const,
    prepStatus: 'ON_PREP' as const,
    lastTestedMonth: '2026-10',
    visible: false,
    reminderMonths: 3 as const,
  };

  it('needs its own consent to be turned on', async () => {
    await expect(t.service.saveHealth(ME, input, NOW)).rejects.toBeInstanceOf(BadRequestException);
    const saved = await t.service.saveHealth(ME, { ...input, consent: true }, NOW);
    expect(saved).toEqual({
      enabled: true,
      prepStatus: 'ON_PREP',
      lastTestedMonth: '2026-10',
      visible: false,
      reminderMonths: 3,
    });
    expect(t.repo.saveHealth).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({ healthConsentAt: NOW }),
    );
  });

  it('keeps the first consent and refuses a future month', async () => {
    const consented = new Date('2026-01-01T00:00:00Z');
    t.cruising.findProfile.mockResolvedValue(profile({ healthConsentAt: consented }));
    await t.service.saveHealth(ME, input, NOW);
    expect(t.repo.saveHealth).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({ healthConsentAt: consented }),
    );
    await expect(
      t.service.saveHealth(ME, { ...input, lastTestedMonth: '2026-12' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes the fields when turned off', async () => {
    expect(await t.service.saveHealth(ME, { enabled: false }, NOW)).toMatchObject({
      enabled: false,
      prepStatus: null,
    });
    expect(t.repo.clearHealth).toHaveBeenCalledWith(ME);
  });

  it('reminds once per due date: push, or email when there is no device', async () => {
    const due = {
      ...profile({
        healthConsentAt: NOW,
        lastTestedMonth: '2026-08',
        reminderMonths: 3,
      }),
      user: { email: 'me@example.com', locale: 'EN' },
    };
    t.repo.healthReminderCandidates.mockResolvedValue([
      due,
      { ...due, userId: CONTACT, healthRemindedAt: NOW },
      { ...due, userId: SPOT, suspendedAt: NOW },
    ]);
    expect(await t.service.sendHealthReminders(NOW)).toBe(1);
    expect(t.repo.markHealthReminded).toHaveBeenCalledWith(ME, NOW);
    expect(t.sent[0]?.subject).toBe('Time for your check-up — Cruising');
    expect(t.sent[0]!.text).not.toContain('PrEP');
  });
});
