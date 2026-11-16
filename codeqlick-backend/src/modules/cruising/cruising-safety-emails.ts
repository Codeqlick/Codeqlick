/**
 * The emails of Cruising's safety and health features (architecture 4.15, phase 5). What goes to a
 * trusted contact speaks of "Codeqlick safety alerts" only: never the app, a nickname or anything
 * sexual. What goes to the member says nothing beyond what the notice is.
 */
import type { AccountLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';
import { CRUISING_COPY } from './copy/index.js';

/** The double opt-in invitation to a trusted contact, in the member's language. */
export function contactInviteEmail(
  to: string,
  locale: AccountLocale,
  displayName: string,
  answerUrl: string,
  stopUrl: string,
  siteUrl: string,
): MailMessage {
  const copy = CRUISING_COPY[locale].invite;
  return {
    to,
    subject: copy.subject(displayName),
    ...renderEmail(
      {
        locale,
        preheader: copy.intro(displayName)[0],
        title: copy.title,
        intro: [...copy.intro(displayName)],
        button: { label: copy.button, url: answerUrl },
        outro: [...copy.outro(stopUrl)],
        note: copy.note(displayName),
      },
      siteUrl,
    ),
  };
}

/** To an ACCEPTED contact when a timer runs out unended: only what the member chose to share. */
export function contactAlertEmail(
  to: string,
  locale: AccountLocale,
  alert: {
    displayName: string;
    message: string | null;
    /** Already formatted. */
    time: string;
    spot: { name: string; mapUrl: string } | null;
  },
  stopUrl: string,
  siteUrl: string,
): MailMessage {
  const copy = CRUISING_COPY[locale].alert;
  const details: Array<[string, string]> = [[copy.time, alert.time]];
  if (alert.spot) {
    details.push([copy.place, alert.spot.name], [copy.map, alert.spot.mapUrl]);
  }
  return {
    to,
    subject: copy.subject(alert.displayName),
    ...renderEmail(
      {
        locale,
        preheader: copy.intro(alert.displayName)[0],
        title: copy.title,
        intro: [...copy.intro(alert.displayName)],
        quote: alert.message ? { title: copy.message, body: alert.message } : undefined,
        details,
        button: alert.spot ? { label: copy.button, url: alert.spot.mapUrl } : undefined,
        outro: [...copy.outro(stopUrl)],
        note: copy.note,
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** Where the member's reminders open, on Cruising's host. */
const MEMBER_PATH = { timer: '/me#timer', health: '/health' } as const;

/** To the member: their timer is about to run out, or their check-up is due (nothing more). */
export function memberSafetyEmail(
  to: string,
  locale: AccountLocale,
  kind: 'timer' | 'health',
  cruisingUrl: string,
  siteUrl: string,
): MailMessage {
  const copy = CRUISING_COPY[locale].member;
  const text = copy[kind];
  return {
    to,
    subject: `${text.subject} — Cruising`,
    ...renderEmail(
      {
        locale,
        preheader: text.body,
        title: text.subject,
        intro: [text.body],
        button: { label: text.button, url: `${cruisingUrl}/${locale}${MEMBER_PATH[kind]}` },
        note: kind === 'health' ? copy.settings : undefined,
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** A push of the timer's reminder or the check-up reminder. */
export function safetyPushPayload(
  kind: 'timer' | 'health',
  locale: AccountLocale,
): { title: string; body: string; url: string; tag: string } {
  return {
    title: 'Cruising',
    body: CRUISING_COPY[locale].safetyPush[kind],
    url: `/${locale}/me#${kind}`,
    tag: `cruising-${kind}`,
  };
}
