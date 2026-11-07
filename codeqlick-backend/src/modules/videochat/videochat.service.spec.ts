import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { VideochatRepository } from './videochat.repository.js';
import { ageOn, VIDEOCHAT_TERMS_VERSION } from './videochat.schemas.js';
import { TICKET_TTL_MS, VideochatService } from './videochat.service.js';

function service(
  profile: object | null = { termsVersion: VIDEOCHAT_TERMS_VERSION, suspendedAt: null },
  turn = { urls: ['stun:turn.test:3478', 'turn:turn.test:3478?transport=udp'], secret: 's3cret' },
) {
  const repository = {
    findProfile: vi.fn().mockResolvedValue(profile),
    saveOnboarding: vi.fn().mockResolvedValue(undefined),
  } as unknown as VideochatRepository;
  const config = { turn, videochatAgeVerificationRequired: false } as unknown as AppConfigService;
  return { svc: new VideochatService(repository, config, {} as MailService), repository };
}

describe('ageOn', () => {
  it('counts whole years, the birthday included', () => {
    const today = new Date('2026-11-07T12:00:00Z');
    expect(ageOn('2008-11-07', today)).toBe(18);
    expect(ageOn('2008-11-08', today)).toBe(17);
    expect(ageOn('2008-12-01', today)).toBe(17);
    expect(ageOn('1990-01-31', today)).toBe(36);
  });
});

describe('VideochatService', () => {
  it('refuses people under 18 and stores nothing for them', async () => {
    const { svc, repository } = service(null);
    await expect(
      svc.onboard(
        'u1',
        { birthDate: '2010-01-01', acceptTerms: true, termsVersion: VIDEOCHAT_TERMS_VERSION },
        new Date('2026-11-07T00:00:00Z'),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.saveOnboarding).not.toHaveBeenCalled();
  });

  it('refuses an outdated version of the rules', async () => {
    const { svc } = service(null);
    await expect(
      svc.onboard('u1', { birthDate: '1990-01-01', acceptTerms: true, termsVersion: 'old' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('issues single-use tickets that expire', async () => {
    const { svc } = service();
    const now = 1_000_000;
    const first = await svc.issueTicket('u1', now);
    expect(svc.redeemTicket(first.ticket, now + 1)).toBe('u1');
    expect(svc.redeemTicket(first.ticket, now + 2)).toBeUndefined();
    const second = await svc.issueTicket('u1', now);
    expect(svc.redeemTicket(second.ticket, now + TICKET_TTL_MS + 1)).toBeUndefined();
  });

  it('gives no ticket to a suspended or not onboarded account', async () => {
    await expect(
      service({ termsVersion: VIDEOCHAT_TERMS_VERSION, suspendedAt: new Date() }).svc.issueTicket(
        'u1',
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service(null).svc.issueTicket('u1')).rejects.toMatchObject({ status: 409 });
  });

  it('asks for a verified age only when that is switched on', async () => {
    const repository = {
      findProfile: vi
        .fn()
        .mockResolvedValue({ termsVersion: VIDEOCHAT_TERMS_VERSION, suspendedAt: null }),
    } as unknown as VideochatRepository;
    const strict = new VideochatService(
      repository,
      { turn: { urls: [] }, videochatAgeVerificationRequired: true } as unknown as AppConfigService,
      {} as MailService,
    );
    expect(await strict.status('u1')).toMatchObject({ onboarded: true, allowed: false });
    await expect(strict.issueTicket('u1')).rejects.toMatchObject({ status: 403 });
  });

  it('signs TURN credentials the way coturn checks them', () => {
    const { svc } = service();
    const [stun, turn] = svc.iceServers('u1', 1_000_000);
    expect(stun).toEqual({ urls: ['stun:turn.test:3478'] });
    expect(turn?.urls).toEqual(['turn:turn.test:3478?transport=udp']);
    expect(turn?.username).toBe(`${1_000 + 12 * 3600}:u1`);
    expect(turn?.credential).toBe(
      createHmac('sha1', 's3cret')
        .update(turn?.username ?? '')
        .digest('base64'),
    );
  });

  it('gives no TURN server without the secret', () => {
    const { svc } = service(undefined, {
      urls: ['turn:turn.test:3478'],
      secret: undefined as never,
    });
    expect(svc.iceServers('u1')).toEqual([]);
  });
});
