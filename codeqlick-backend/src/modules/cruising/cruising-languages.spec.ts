import { describe, expect, it } from 'vitest';
import { ACCOUNT_LOCALES } from '../../common/schemas/common.schemas.js';
import { CRUISING_COPY } from './copy/index.js';
import { cruisingNoticeEmail, cruisingTakedownEmail } from './cruising-emails.js';
import {
  contactAlertEmail,
  memberSafetyEmail,
  safetyPushPayload,
} from './cruising-safety-emails.js';
import { pushPayload } from './cruising.rules.js';

const SITE = 'https://codeqlick.com';
const CRUISING = 'https://cruising.codeqlick.com';

/** Every string of a copy, functions called with a marker, to compare their shapes. */
function shape(value: unknown): unknown {
  if (typeof value === 'function') return shape((value as (arg: string) => unknown)('X'));
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return value.map(shape);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, shape(item)]),
  );
}

describe("Cruising's languages (decision 103)", () => {
  it('has every text in every language, none left empty or in English', () => {
    const english = shape(CRUISING_COPY.en);
    for (const locale of ACCOUNT_LOCALES) {
      expect(shape(CRUISING_COPY[locale])).toEqual(english);
      const texts = JSON.stringify(CRUISING_COPY[locale]);
      expect(texts).not.toContain('""');
    }
    const subjects = ACCOUNT_LOCALES.map((locale) => CRUISING_COPY[locale].notice.unread.subject);
    expect(new Set(subjects).size).toBe(ACCOUNT_LOCALES.length);
  });

  it.each([
    ['fr', 'Tu as un message non lu'],
    ['de', 'ungelesene'],
    ['it', 'messaggio non letto'],
    ['pt', 'mensagem por ler'],
  ] as const)('writes a notice in %s, linking Cruising in that language', (locale, words) => {
    const mail = cruisingNoticeEmail('a@example.com', locale, 'unread', null, CRUISING, SITE);
    expect(mail.subject).toContain(CRUISING_COPY[locale].notice.unread.subject);
    expect(mail.subject.toLowerCase()).toContain(words.toLowerCase());
    expect(mail.html).toContain(`lang="${locale}"`);
    expect(mail.text).toContain(`${CRUISING}/${locale}/messages`);
    // The logo links the website, which speaks English and Spanish only.
    expect(mail.html).toContain(`href="${SITE}/en"`);
    expect(mail.html).not.toContain('Questions? Just reply to this email.');
  });

  it('writes the removal, safety and push texts in each language', () => {
    for (const locale of ['fr', 'de', 'it', 'pt'] as const) {
      const copy = CRUISING_COPY[locale];
      expect(
        cruisingTakedownEmail('a@example.com', locale, 'received', 'abcdef12', null, SITE).subject,
      ).toContain(copy.takedown.receivedSubject);
      expect(memberSafetyEmail('a@example.com', locale, 'timer', CRUISING, SITE).text).toContain(
        `${CRUISING}/${locale}/me#timer`,
      );
      const alert = contactAlertEmail(
        'b@example.com',
        locale,
        { displayName: 'Sam', message: null, time: '1 2026', spot: null },
        `${SITE}/en/safety-contact?token=t`,
        SITE,
      );
      expect(alert.subject).toBe(copy.alert.subject('Sam'));
      expect(safetyPushPayload('health', locale)).toMatchObject({
        body: copy.safetyPush.health,
        url: `/${locale}/me#health`,
      });
      expect(pushPayload('wink', locale)).toMatchObject({ body: copy.push.wink });
    }
  });
});
