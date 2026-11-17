import type { AccountLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';
import { CRUISING_COPY, cruisingDateLocale } from './copy/index.js';

/** Alert for the team: a report or removal request that needs a look first. No personal data. */
export function cruisingAlertEmail(
  to: string,
  kind: 'minor-report' | 'takedown',
  id: string,
  siteUrl: string,
): MailMessage {
  const minor = kind === 'minor-report';
  const title = minor ? 'Cruising: possible minor reported' : 'Cruising: removal request';
  return {
    to,
    subject: title,
    ...renderEmail(
      {
        locale: 'en',
        preheader: minor
          ? 'Review it first: something in Cruising was reported for involving someone who may be under 18.'
          : 'Someone asked to remove a spot or a photo or video. For the serious reasons it is hidden until you review it.',
        title,
        intro: minor
          ? [
              'A spot, review, profile or photo or video in Cruising was reported for involving someone who may be under 18. A spot, review, photo or video is hidden already.',
              'Review the report, remove it and suspend the account if it is confirmed.',
            ]
          : [
              'Someone asked to remove a spot or a photo or video from Cruising. A matched spot is hidden already when the reason is a minor or something illegal; a matched photo or video also when it is about consent or a stolen image.',
              'Answer within 24 hours.',
            ],
        details: [[minor ? 'Report id' : 'Request id', id]],
        button: { label: 'Open Cruising moderation', url: `${siteUrl}/es/admin/cruising` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** To whoever asked for a removal: received, removed, or reviewed without removing. */
export function cruisingTakedownEmail(
  to: string,
  locale: AccountLocale,
  stage: 'received' | 'removed' | 'closed',
  requestId: string,
  response: string | null,
  siteUrl: string,
): MailMessage {
  const copy = CRUISING_COPY[locale].takedown;
  return {
    to,
    subject: `${copy[`${stage}Subject`]} — Cruising`,
    ...renderEmail(
      {
        brand: 'neoqlick',
        locale,
        preheader: copy[stage],
        title: copy[`${stage}Title`],
        intro: [copy[stage]],
        quote: response ? { title: copy.answer, body: response } : undefined,
        details: [[copy.reference, requestId.slice(0, 8).toUpperCase()]],
      },
      siteUrl,
    ),
  };
}

/** Things a person is told about. The emails never carry a spot name, a nickname or a message. */
export type CruisingNotice =
  | 'spot-live'
  | 'spot-rejected'
  | 'spot-removed'
  | 'suspended'
  | 'unread'
  | 'verification-approved'
  | 'verification-rejected'
  | 'verification-withdrawn'
  | 'media-removed'
  | 'favorites'
  | 'meetup-cancelled';

/** Where each notice's button opens, on Cruising's host. */
const NOTICE_PATH: Record<CruisingNotice, string> = {
  'spot-live': '/my-spots',
  'spot-rejected': '/my-spots',
  'spot-removed': '/my-spots',
  suspended: '/rules',
  unread: '/messages',
  'verification-approved': '/me',
  'verification-rejected': '/me',
  'verification-withdrawn': '/rules',
  'media-removed': '/me',
  favorites: '/favorites',
  'meetup-cancelled': '/meetups',
};

function formatDay(date: Date, locale: AccountLocale): string {
  return new Intl.DateTimeFormat(cruisingDateLocale(locale), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** An email to a member about `notice`; `note` is the team's reason, if any. */
export function cruisingNoticeEmail(
  to: string,
  locale: AccountLocale,
  notice: CruisingNotice,
  note: string | null,
  cruisingUrl: string,
  siteUrl: string,
  until: Date | null = null,
): MailMessage {
  const copy = CRUISING_COPY[locale].notice;
  const text = copy[notice];
  return {
    to,
    subject: `${text.subject} — Cruising`,
    ...renderEmail(
      {
        brand: 'neoqlick',
        locale,
        preheader: text.body,
        title: text.subject,
        intro: [text.body],
        quote: note ? { title: copy.reasonTitle, body: note } : undefined,
        details:
          notice === 'suspended'
            ? [[copy.until, until ? formatDay(until, locale) : copy.permanent]]
            : undefined,
        button: { label: text.button, url: `${cruisingUrl}/${locale}${NOTICE_PATH[notice]}` },
        note:
          notice === 'spot-live' ||
          notice === 'unread' ||
          notice === 'favorites' ||
          notice === 'meetup-cancelled'
            ? copy.settings
            : undefined,
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** The team's digest: what is waiting in Cruising's moderation. */
export function cruisingDigestEmail(
  to: string,
  counts: {
    spots: number;
    reports: number;
    takedowns: number;
    media: number;
    verifications: number;
  },
  siteUrl: string,
): MailMessage {
  const total =
    counts.spots + counts.reports + counts.takedowns + counts.media + counts.verifications;
  return {
    to,
    subject: `Cruising: ${total} waiting for review`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: 'New things are waiting in Cruising moderation.',
        title: 'Waiting in Cruising moderation',
        intro: ['New things arrived since the last digest. People wait for them to go live.'],
        details: [
          ['Spots to review', String(counts.spots)],
          ['Reports', String(counts.reports)],
          ['Removal requests', String(counts.takedowns)],
          ['New photos and videos', String(counts.media)],
          ['Verification photos', String(counts.verifications)],
        ],
        button: { label: 'Open Cruising moderation', url: `${siteUrl}/es/admin/cruising` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
