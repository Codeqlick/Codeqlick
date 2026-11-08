import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** Alert for the team: a report or removal request that needs a look first. No personal data. */
export function swipeAlertEmail(
  to: string,
  kind: 'minor-report' | 'takedown',
  id: string,
  siteUrl: string,
): MailMessage {
  const minor = kind === 'minor-report';
  const title = minor ? 'Swipe: possible minor reported' : 'Swipe: removal request';
  return {
    to,
    subject: title,
    ...renderEmail(
      {
        locale: 'en',
        preheader: minor
          ? 'Review it first: a photo was reported as showing someone who may be under 18.'
          : 'Someone asked to remove a photo. It is hidden until you review it.',
        title,
        intro: minor
          ? [
              'A photo in Swipe was reported as showing someone who may be under 18. It is hidden already.',
              'Review the report and remove the photo and suspend the account if it is confirmed.',
            ]
          : [
              'Someone asked to remove a photo from Swipe. When the reference matched a photo, it is hidden already.',
              'Answer within 24 hours.',
            ],
        details: [[minor ? 'Report id' : 'Request id', id]],
        button: { label: 'Open Swipe moderation', url: `${siteUrl}/es/admin/swipe` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

const TAKEDOWN_COPY = {
  es: {
    receivedSubject: 'Hemos recibido tu solicitud de retirada',
    receivedTitle: 'Solicitud recibida',
    received:
      'Hemos recibido tu solicitud para retirar una foto de Swipe. Si la referencia coincide con una foto, ya está oculta. La revisamos y te respondemos en 24 horas como máximo.',
    removedSubject: 'Hemos retirado la foto',
    removedTitle: 'Foto retirada',
    removed:
      'Hemos revisado tu solicitud y retirado la foto. Tampoco se podrá volver a subir la misma imagen.',
    closedSubject: 'Hemos revisado tu solicitud de retirada',
    closedTitle: 'Solicitud revisada',
    closed: 'Hemos revisado tu solicitud y no hemos retirado ninguna foto.',
    answer: 'Respuesta del equipo',
    reference: 'Referencia de la solicitud',
  },
  en: {
    receivedSubject: 'We received your removal request',
    receivedTitle: 'Request received',
    received:
      'We received your request to remove a photo from Swipe. If the reference matched a photo, it is hidden already. We review it and answer within 24 hours.',
    removedSubject: 'We removed the photo',
    removedTitle: 'Photo removed',
    removed:
      'We reviewed your request and removed the photo. The same image can no longer be uploaded either.',
    closedSubject: 'We reviewed your removal request',
    closedTitle: 'Request reviewed',
    closed: 'We reviewed your request and did not remove any photo.',
    answer: "The team's answer",
    reference: 'Request reference',
  },
} as const;

/** To whoever asked for a removal: received, removed, or reviewed without removing. */
export function takedownEmail(
  to: string,
  locale: ApiLocale,
  stage: 'received' | 'removed' | 'closed',
  requestId: string,
  response: string | null,
  siteUrl: string,
): MailMessage {
  const copy = TAKEDOWN_COPY[locale];
  const subject = copy[`${stage}Subject`];
  const body = copy[stage];
  return {
    to,
    subject: `${subject} — Swipe`,
    ...renderEmail(
      {
        locale,
        preheader: body,
        title: copy[`${stage}Title`],
        intro: [body],
        quote: response ? { title: copy.answer, body: response } : undefined,
        details: [[copy.reference, requestId.slice(0, 8).toUpperCase()]],
      },
      siteUrl,
    ),
  };
}

/** Things a person is told about. The emails never carry a photo, a nickname or a message. */
export type SwipeNotice =
  | 'verification-approved'
  | 'verification-rejected'
  | 'photo-live'
  | 'photo-rejected'
  | 'match'
  | 'loved'
  | 'unread';

const NOTICE_COPY: Record<
  ApiLocale,
  Record<SwipeNotice, { subject: string; body: string; button: string; path: string }> & {
    noteTitle: string;
    reasonTitle: string;
    settings: string;
  }
> = {
  es: {
    'verification-approved': {
      subject: 'Ya puedes subir tus fotos',
      body: 'Hemos revisado tu foto de verificación y está todo bien: ya puedes subir tus fotos. Las revisamos antes de publicarlas.',
      button: 'Subir mis fotos',
      path: '/photos',
    },
    'verification-rejected': {
      subject: 'Tu foto de verificación no es válida',
      body: 'Hemos revisado tu foto de verificación y no podemos aceptarla. Puedes enviar otra cuando quieras.',
      button: 'Enviar otra foto',
      path: '/photos',
    },
    'photo-live': {
      subject: 'Tu foto ya está publicada',
      body: 'Hemos revisado una de tus fotos y ya está publicada: otras personas ya pueden verla.',
      button: 'Ver mis fotos',
      path: '/photos',
    },
    'photo-rejected': {
      subject: 'Hemos retirado una de tus fotos',
      body: 'Hemos revisado una de tus fotos y no la hemos publicado, o la hemos retirado. Este es el motivo:',
      button: 'Ver mis fotos',
      path: '/photos',
    },
    match: {
      subject: 'Tienes un match nuevo',
      body: 'Os han gustado las fotos el uno del otro: ya podéis hablar.',
      button: 'Ver mis matches',
      path: '/matches',
    },
    loved: {
      subject: 'A alguien le encanta una de tus fotos',
      body: 'Alguien ha marcado «me encanta» en una de tus fotos. Sus fotos te saldrán las primeras.',
      button: 'Ver quién es',
      path: '/deck',
    },
    unread: {
      subject: 'Tienes un mensaje sin leer',
      body: 'Uno de tus matches te ha escrito y aún no lo has leído.',
      button: 'Leer el mensaje',
      path: '/matches',
    },
    noteTitle: 'Nota del equipo',
    reasonTitle: 'Motivo',
    settings: 'Puedes dejar de recibir estos avisos en tu perfil de Swipe.',
  },
  en: {
    'verification-approved': {
      subject: 'You can upload your photos now',
      body: 'We reviewed your verification photo and all is well: you can upload your photos now. We review them before they go live.',
      button: 'Upload my photos',
      path: '/photos',
    },
    'verification-rejected': {
      subject: 'Your verification photo is not valid',
      body: "We reviewed your verification photo and can't accept it. You can send another one whenever you like.",
      button: 'Send another photo',
      path: '/photos',
    },
    'photo-live': {
      subject: 'Your photo is live',
      body: 'We reviewed one of your photos and it is live: other people can see it now.',
      button: 'See my photos',
      path: '/photos',
    },
    'photo-rejected': {
      subject: 'We removed one of your photos',
      body: "We reviewed one of your photos and didn't publish it, or removed it. This is why:",
      button: 'See my photos',
      path: '/photos',
    },
    match: {
      subject: 'You have a new match',
      body: "You and someone else liked each other's photos: you can talk now.",
      button: 'See my matches',
      path: '/matches',
    },
    loved: {
      subject: 'Someone loves one of your photos',
      body: 'Someone gave one of your photos a «love». Their photos will come first for you.',
      button: 'See who it is',
      path: '/deck',
    },
    unread: {
      subject: 'You have an unread message',
      body: "One of your matches wrote to you and you haven't read it yet.",
      button: 'Read the message',
      path: '/matches',
    },
    noteTitle: "The team's note",
    reasonTitle: 'Reason',
    settings: 'You can stop these emails in your Swipe profile.',
  },
};

/** An email to a Swipe user about `notice`; `note` is the team's note or reason, if any. */
export function swipeNoticeEmail(
  to: string,
  locale: ApiLocale,
  notice: SwipeNotice,
  note: string | null,
  swipeUrl: string,
  siteUrl: string,
): MailMessage {
  const copy = NOTICE_COPY[locale];
  const text = copy[notice];
  const optional = notice === 'match' || notice === 'loved' || notice === 'unread';
  return {
    to,
    subject: `${text.subject} — Swipe`,
    ...renderEmail(
      {
        locale,
        preheader: text.body,
        title: text.subject,
        intro: [text.body],
        quote: note
          ? {
              title: notice === 'photo-rejected' ? copy.reasonTitle : copy.noteTitle,
              body: note,
            }
          : undefined,
        button: { label: text.button, url: `${swipeUrl}/${locale}${text.path}` },
        note: optional ? copy.settings : undefined,
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** The team's digest: what is waiting in Swipe's moderation. */
export function swipeDigestEmail(
  to: string,
  counts: { verifications: number; photos: number; reports: number; takedowns: number },
  siteUrl: string,
): MailMessage {
  const total = counts.verifications + counts.photos + counts.reports + counts.takedowns;
  return {
    to,
    subject: `Swipe: ${total} waiting for review`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: 'New things are waiting in Swipe moderation.',
        title: 'Waiting in Swipe moderation',
        intro: ['New things arrived since the last digest. People wait for them to go live.'],
        details: [
          ['Verification photos', String(counts.verifications)],
          ['Photos', String(counts.photos)],
          ['Reports', String(counts.reports)],
          ['Removal requests', String(counts.takedowns)],
        ],
        button: { label: 'Open Swipe moderation', url: `${siteUrl}/es/admin/swipe` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
