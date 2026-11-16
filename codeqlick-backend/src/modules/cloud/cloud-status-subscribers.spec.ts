import { describe, expect, it } from 'vitest';
import { CLOUD_PLANS } from './cloud-plans.js';
import { cloudStatusConfirmEmail, cloudStatusEmail, cloudStatusSubject } from './cloud-emails.js';
import {
  canSubscribe,
  CONFIRM_RESEND_MS,
  confirmSkip,
  emailRoom,
  hashToken,
  HOUR_MS,
  maskEmail,
  newConfirmToken,
  newUnsubscribeToken,
  TeamSignupLimiter,
  updateDispatchKind,
} from './cloud-status-subscribers.js';

const now = new Date('2026-11-17T10:00:00Z');

describe('status page subscriptions: tokens', () => {
  it('stores only the hash of the confirmation token', () => {
    const { token, hash } = newConfirmToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(newConfirmToken().token).not.toBe(token);
  });

  it('makes unguessable unsubscribe tokens', () => {
    const a = newUnsubscribeToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(newUnsubscribeToken()).not.toBe(a);
  });
});

describe('status page subscriptions: masking', () => {
  it('keeps the first characters and the last label only', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j***@e***.com');
    expect(maskEmail('ada@mail.example.co.uk')).toBe('a***@m***.uk');
    expect(maskEmail('x@localhost')).toBe('x***@l***');
    expect(maskEmail('broken')).toBe('***');
  });
});

describe('status page subscriptions: which updates send what', () => {
  it('sends RESOLVED for a resolution or a completed maintenance, UPDATE otherwise', () => {
    expect(updateDispatchKind('RESOLVED')).toBe('RESOLVED');
    expect(updateDispatchKind('COMPLETED')).toBe('RESOLVED');
    expect(updateDispatchKind('MONITORING')).toBe('UPDATE');
    expect(updateDispatchKind('INVESTIGATING')).toBe('UPDATE');
    expect(updateDispatchKind(null)).toBe('UPDATE');
  });
});

describe('status page subscriptions: confirmation emails', () => {
  it('never emails an active address', () => {
    expect(confirmSkip({ status: 'ACTIVE', confirmSentAt: null }, 0, now)).toBe('active');
  });

  it('sends at most one per address and team every 10 minutes', () => {
    const recent = new Date(now.getTime() - CONFIRM_RESEND_MS + 1000);
    const old = new Date(now.getTime() - CONFIRM_RESEND_MS);
    expect(confirmSkip({ status: 'PENDING', confirmSentAt: recent }, 1, now)).toBe('recent');
    expect(confirmSkip({ status: 'PENDING', confirmSentAt: old }, 1, now)).toBeNull();
    expect(confirmSkip({ status: 'UNSUBSCRIBED', confirmSentAt: null }, 0, now)).toBeNull();
    expect(confirmSkip(null, 0, now)).toBeNull();
  });

  it('sends at most 5 a day per address over all teams', () => {
    expect(confirmSkip(null, 4, now)).toBeNull();
    expect(confirmSkip(null, 5, now)).toBe('address-day');
  });
});

describe('status page subscriptions: caps', () => {
  it('has a subscriber cap and an hourly email cap per plan', () => {
    expect(CLOUD_PLANS.FREE.statusSubscribers).toBe(500);
    expect(CLOUD_PLANS.PRO.statusSubscribers).toBe(5000);
    expect(CLOUD_PLANS.FREE.statusEmailsPerHour).toBe(1000);
    expect(CLOUD_PLANS.PRO.statusEmailsPerHour).toBe(10_000);
  });

  it('offers the form only with subscriptions on and room under the cap', () => {
    expect(canSubscribe(true, 499, 500)).toBe(true);
    expect(canSubscribe(true, 500, 500)).toBe(false);
    expect(canSubscribe(false, 0, 500)).toBe(false);
  });

  it('counts emails in an hour that starts at the first send', () => {
    expect(emailRoom({ emailWindowStart: null, emailsInWindow: 0 }, 1000, now)).toEqual({
      windowStart: now,
      used: 0,
      room: 1000,
    });
    const start = new Date(now.getTime() - 30 * 60_000);
    expect(emailRoom({ emailWindowStart: start, emailsInWindow: 990 }, 1000, now)).toEqual({
      windowStart: start,
      used: 990,
      room: 10,
    });
    expect(emailRoom({ emailWindowStart: start, emailsInWindow: 1200 }, 1000, now).room).toBe(0);
    // An hour later the window starts again.
    const passed = new Date(now.getTime() - HOUR_MS);
    expect(emailRoom({ emailWindowStart: passed, emailsInWindow: 1000 }, 1000, now)).toEqual({
      windowStart: now,
      used: 0,
      room: 1000,
    });
  });

  it('limits sign-ups per team an hour', () => {
    const limiter = new TeamSignupLimiter(2, HOUR_MS);
    const t = now.getTime();
    expect(limiter.take('a', t)).toBe(true);
    expect(limiter.take('a', t)).toBe(true);
    expect(limiter.take('a', t)).toBe(false);
    expect(limiter.take('b', t)).toBe(true);
    expect(limiter.take('a', t + HOUR_MS)).toBe(true);
  });

  it('remembers a bounded number of teams', () => {
    const limiter = new TeamSignupLimiter(1, HOUR_MS, 2);
    const t = now.getTime();
    limiter.take('a', t);
    limiter.take('b', t);
    limiter.take('c', t);
    // 'a' was forgotten to make room, so it may sign up again.
    expect(limiter.take('a', t)).toBe(true);
  });
});

describe('status page subscriptions: emails', () => {
  const base = {
    to: 'ada@example.com',
    kind: 'NOTICE' as const,
    pageTitle: 'Acme status',
    team: 'Acme',
    notice: {
      kind: 'INCIDENT' as const,
      title: 'Slow   API',
      state: 'INVESTIGATING' as const,
      monitors: ['Public API'],
    },
    body: 'We are looking into it.\n<b>More soon</b>',
    pageUrl: 'https://cloud.codeqlick.com/en/status/acme',
    unsubscribe: {
      pageUrl: 'https://cloud.codeqlick.com/en/status-updates/unsubscribe?token=t',
      oneClickUrl: 'https://api.codeqlick.com/v1/cloud/status-subscribers/unsubscribe/t',
    },
    siteUrl: 'https://codeqlick.com',
  };

  it('writes the subject in the reader language, collapsed and capped', () => {
    expect(cloudStatusSubject('en', 'NOTICE', 'INCIDENT', 'Acme status', 'Slow   API')).toBe(
      '[Acme status] Incident: Slow API',
    );
    expect(cloudStatusSubject('es', 'NOTICE', 'MAINTENANCE', 'Acme', 'DB')).toBe(
      '[Acme] Mantenimiento programado: DB',
    );
    expect(cloudStatusSubject('es', 'MAINTENANCE_STARTED', 'MAINTENANCE', 'Acme', 'DB')).toBe(
      '[Acme] Mantenimiento iniciado: DB',
    );
    expect(cloudStatusSubject('en', 'RESOLVED', 'INCIDENT', 'A', 'x'.repeat(300)).length).toBe(150);
  });

  it('is plain text plus branded HTML, with one-click unsubscribe and the escaped text', () => {
    const message = cloudStatusEmail({ ...base, locale: 'en' });
    expect(message.subject).toBe('[Acme status] Incident: Slow API');
    expect(message.listUnsubscribe).toBe(base.unsubscribe.oneClickUrl);
    expect(message.text).toContain('We are looking into it.');
    expect(message.text).toContain('Investigating');
    expect(message.text).toContain('Public API');
    expect(message.text).toContain(base.unsubscribe.pageUrl);
    expect(message.text).toContain('sent by Codeqlick for Acme');
    expect(message.html).toContain('&lt;b&gt;More soon&lt;/b&gt;');
    expect(message.html).not.toContain('<b>More soon</b>');
    expect(message.replyTo).toBeUndefined();
  });

  it('speaks Spanish to Spanish subscribers', () => {
    const message = cloudStatusEmail({ ...base, locale: 'es', kind: 'RESOLVED' });
    expect(message.subject).toBe('[Acme status] Resuelto: Slow API');
    expect(message.text).toContain('Investigando');
    expect(message.html).toContain('Ver la página de estado');
    expect(message.text).toContain('Codeqlick te los envía en nombre de Acme');
  });

  it('asks to confirm without unsubscribe headers, naming who is responsible', () => {
    const message = cloudStatusConfirmEmail({
      to: 'ada@example.com',
      locale: 'en',
      pageTitle: 'Acme status',
      team: 'Acme',
      url: 'https://cloud.codeqlick.com/en/status-updates/confirm?token=x',
      siteUrl: 'https://codeqlick.com',
    });
    expect(message.subject).toBe('Confirm your subscription to Acme status');
    expect(message.listUnsubscribe).toBeUndefined();
    expect(message.text).toContain('status-updates/confirm?token=x');
    expect(message.text).toContain('Acme is responsible for your address');
    expect(message.html).toBeTruthy();
  });
});
