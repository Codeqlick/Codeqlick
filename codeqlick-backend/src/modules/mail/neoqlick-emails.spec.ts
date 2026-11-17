import { describe, expect, it } from 'vitest';
import type { AccountLocale } from '../../common/schemas/common.schemas.js';
import { adultNoticeEmail, type AdultNotice } from '../adult/adult-emails.js';
import {
  accountDeletedEmail,
  emailChangeConfirmEmail,
  emailChangedNoticeEmail,
} from '../auth/account-emails.js';
import {
  alreadyRegisteredEmail,
  newDeviceSignInEmail,
  passkeyAddedEmail,
  passwordResetEmail,
  signupConfirmEmail,
} from '../auth/auth-emails.js';
import {
  cruisingNoticeEmail,
  cruisingTakedownEmail,
  type CruisingNotice,
} from '../cruising/cruising-emails.js';
import {
  contactAlertEmail,
  contactInviteEmail,
  memberSafetyEmail,
} from '../cruising/cruising-safety-emails.js';
import { swipeNoticeEmail, takedownEmail, type SwipeNotice } from '../swipe/swipe-emails.js';
import { appealResolvedEmail } from '../videochat/videochat-emails.js';
import { brandText } from './email-layout.js';
import type { MailMessage } from './mail.service.js';

/**
 * Architecture 4.18, decision 125: a Neoqlick person never sees Codeqlick, so every email sent to
 * one (the account emails and the three apps') says Neoqlick, links to Neoqlick's hosts and is
 * marked for Neoqlick's sender.
 */
const SITE = 'https://neoqlick.com';
const ACCOUNT = 'https://account.neoqlick.com';
const LOCALES: AccountLocale[] = ['en', 'es', 'fr', 'de', 'it', 'pt'];
const person = { name: 'Ada', email: 'ada@example.com' };

function everyEmail(): Array<[string, MailMessage]> {
  const emails: Array<[string, MailMessage]> = [];
  const add = (name: string, message: MailMessage) => emails.push([name, message]);
  const when = new Date('2026-11-17T10:00:00Z');

  for (const locale of ['en', 'es'] as const) {
    const brand = 'neoqlick' as const;
    add(
      `reset ${locale}`,
      passwordResetEmail(person, `${ACCOUNT}/${locale}/reset`, locale, 60, SITE, brand),
    );
    add(
      `confirm ${locale}`,
      signupConfirmEmail(person, `${ACCOUNT}/${locale}/register/confirm`, locale, 24, SITE, brand),
    );
    add(
      `already ${locale}`,
      alreadyRegisteredEmail(
        person,
        { login: `${SITE}/${locale}/login`, reset: `${ACCOUNT}/${locale}/forgot-password` },
        locale,
        SITE,
        brand,
      ),
    );
    add(
      `new device ${locale}`,
      newDeviceSignInEmail(
        person,
        { at: when, browser: 'Firefox', os: 'Linux', ip: '203.0.113.7' },
        `${ACCOUNT}/${locale}/security`,
        `${ACCOUNT}/${locale}/forgot-password`,
        locale,
        SITE,
        brand,
      ),
    );
    add(
      `passkey ${locale}`,
      passkeyAddedEmail(
        person,
        { name: 'Laptop', createdAt: when },
        `${ACCOUNT}/${locale}/security`,
        locale,
        SITE,
        brand,
      ),
    );
    add(
      `email change ${locale}`,
      emailChangeConfirmEmail(person, 'new@example.com', `${ACCOUNT}/x`, locale, 24, SITE, brand),
    );
    add(
      `email changed ${locale}`,
      emailChangedNoticeEmail(person, 'old@example.com', 'new@example.com', locale, SITE, brand),
    );
    add(`deleted ${locale}`, accountDeletedEmail(person, locale, SITE, brand));
  }

  for (const locale of LOCALES) {
    for (const stage of ['received', 'removed', 'closed'] as const) {
      add(
        `cruising takedown ${stage} ${locale}`,
        cruisingTakedownEmail('a@example.com', locale, stage, 'req-1', 'Because.', SITE),
      );
    }
    const notices: CruisingNotice[] = [
      'spot-live',
      'spot-rejected',
      'spot-removed',
      'suspended',
      'unread',
      'verification-approved',
      'verification-rejected',
      'verification-withdrawn',
      'media-removed',
      'favorites',
      'meetup-cancelled',
    ];
    for (const notice of notices) {
      add(
        `cruising ${notice} ${locale}`,
        cruisingNoticeEmail(
          'a@example.com',
          locale,
          notice,
          'Note.',
          `${SITE}/cruising`,
          SITE,
          when,
        ),
      );
    }
    add(
      `invite ${locale}`,
      contactInviteEmail('a@example.com', locale, 'Luis', `${SITE}/answer`, `${SITE}/stop`, SITE),
    );
    add(
      `alert ${locale}`,
      contactAlertEmail(
        'a@example.com',
        locale,
        {
          displayName: 'Luis',
          message: 'Late.',
          time: '22:30',
          spot: { name: 'A spot', mapUrl: 'https://maps.example/x' },
        },
        `${SITE}/stop`,
        SITE,
      ),
    );
    for (const kind of ['timer', 'health'] as const) {
      add(
        `member safety ${kind} ${locale}`,
        memberSafetyEmail('a@example.com', locale, kind, `${SITE}/cruising`, SITE),
      );
    }
    const adult: AdultNotice[] = [
      'verification-approved',
      'verification-rejected',
      'verification-withdrawn',
      'suspended',
    ];
    for (const notice of adult) {
      add(
        `adult ${notice} ${locale}`,
        adultNoticeEmail('a@example.com', locale, notice, 'Why.', SITE, when),
      );
    }
  }

  for (const locale of ['es', 'en'] as const) {
    for (const stage of ['received', 'removed', 'closed'] as const) {
      add(
        `swipe takedown ${stage} ${locale}`,
        takedownEmail('a@example.com', locale, stage, 'req-1', null, SITE),
      );
    }
    const notices: SwipeNotice[] = [
      'verification-approved',
      'verification-rejected',
      'photo-live',
      'photo-rejected',
      'match',
      'loved',
      'unread',
    ];
    for (const notice of notices) {
      add(
        `swipe ${notice} ${locale}`,
        swipeNoticeEmail('a@example.com', locale, notice, 'Note.', `${SITE}/swipe`, SITE),
      );
    }
  }
  for (const locale of ['es', 'en'] as const) {
    for (const accepted of [true, false]) {
      add(
        `appeal ${accepted} ${locale}`,
        appealResolvedEmail(
          { to: 'a@example.com', name: 'Ada', locale },
          { accepted, response: 'Thanks.' },
          `${SITE}/videochat`,
          SITE,
        ),
      );
    }
  }
  return emails;
}

describe("the emails of Neoqlick's people (architecture 4.18)", () => {
  const emails = everyEmail();

  it('covers every kind in every language', () => {
    expect(emails.length).toBeGreaterThan(150);
  });

  it.each(emails)('%s: Neoqlick sender, Neoqlick words, no Codeqlick', (_name, message) => {
    expect(message.brand).toBe('neoqlick');
    // MailService writes the subject in the brand's words when it sends.
    for (const part of [
      brandText(message.subject, message.brand),
      message.text,
      message.html ?? '',
    ]) {
      expect(part.toLowerCase()).not.toContain('codeqlick');
    }
    expect(message.html).toContain(`${SITE}/email/neoqlick-logo.png`);
    expect(message.text).toContain('hello@neoqlick.com');
  });
});
