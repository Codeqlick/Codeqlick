import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

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
          ? 'Review it first: a spot or review was reported for involving someone who may be under 18.'
          : 'Someone asked to remove a spot. For a minor or something illegal, it is hidden until you review it.',
        title,
        intro: minor
          ? [
              'A spot or review in Cruising was reported for involving someone who may be under 18. It is hidden already.',
              'Review the report, remove it and suspend the account if it is confirmed.',
            ]
          : [
              'Someone asked to remove a spot from Cruising. When the reason is a minor or something illegal and the link matched a live spot, it is hidden already.',
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

const TAKEDOWN_COPY = {
  es: {
    receivedSubject: 'Hemos recibido tu solicitud de retirada',
    receivedTitle: 'Solicitud recibida',
    received:
      'Hemos recibido tu solicitud para retirar un lugar de Cruising. Si se trata de un menor o de algo ilegal y el enlace coincide con un lugar publicado, ya está oculto. La revisamos y te respondemos en 24 horas como máximo.',
    removedSubject: 'Hemos retirado el lugar',
    removedTitle: 'Lugar retirado',
    removed: 'Hemos revisado tu solicitud y retirado el lugar del directorio.',
    closedSubject: 'Hemos revisado tu solicitud de retirada',
    closedTitle: 'Solicitud revisada',
    closed: 'Hemos revisado tu solicitud y no hemos retirado ningún lugar.',
    answer: 'Respuesta del equipo',
    reference: 'Referencia de la solicitud',
  },
  en: {
    receivedSubject: 'We received your removal request',
    receivedTitle: 'Request received',
    received:
      'We received your request to remove a spot from Cruising. If it is about a minor or something illegal and the link matched a published spot, it is hidden already. We review it and answer within 24 hours.',
    removedSubject: 'We removed the spot',
    removedTitle: 'Spot removed',
    removed: 'We reviewed your request and removed the spot from the directory.',
    closedSubject: 'We reviewed your removal request',
    closedTitle: 'Request reviewed',
    closed: 'We reviewed your request and did not remove any spot.',
    answer: "The team's answer",
    reference: 'Request reference',
  },
} as const;

/** To whoever asked for a removal: received, removed, or reviewed without removing. */
export function cruisingTakedownEmail(
  to: string,
  locale: ApiLocale,
  stage: 'received' | 'removed' | 'closed',
  requestId: string,
  response: string | null,
  siteUrl: string,
): MailMessage {
  const copy = TAKEDOWN_COPY[locale];
  return {
    to,
    subject: `${copy[`${stage}Subject`]} — Cruising`,
    ...renderEmail(
      {
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
  'spot-live' | 'spot-rejected' | 'spot-removed' | 'suspended' | 'unread' | 'favorites';

const NOTICE_COPY: Record<
  ApiLocale,
  Record<CruisingNotice, { subject: string; body: string; button: string; path: string }> & {
    reasonTitle: string;
    until: string;
    permanent: string;
    settings: string;
  }
> = {
  es: {
    'spot-live': {
      subject: 'Tu lugar ya está publicado',
      body: 'Hemos revisado uno de los lugares que propusiste y ya está publicado en el mapa.',
      button: 'Ver mis lugares',
      path: '/my-spots',
    },
    'spot-rejected': {
      subject: 'No hemos publicado uno de tus lugares',
      body: 'Hemos revisado uno de los lugares que propusiste y no lo hemos publicado. Este es el motivo:',
      button: 'Ver mis lugares',
      path: '/my-spots',
    },
    'spot-removed': {
      subject: 'Hemos retirado uno de tus lugares',
      body: 'Tras una denuncia, hemos retirado uno de los lugares que propusiste. La retirada es definitiva. Este es el motivo:',
      button: 'Ver mis lugares',
      path: '/my-spots',
    },
    suspended: {
      subject: 'Tu cuenta de Cruising está suspendida',
      body: 'Hemos suspendido tu cuenta de Cruising. Puedes seguir consultando el mapa, pero no proponer lugares, escribir opiniones, enviar denuncias, marcar que estás en un lugar ni enviar mensajes.',
      button: 'Leer las normas',
      path: '/rules',
    },
    unread: {
      subject: 'Tienes un mensaje sin leer',
      body: 'Alguien te ha escrito en Cruising y aún no lo has leído.',
      button: 'Leer el mensaje',
      path: '/messages',
    },
    favorites: {
      subject: 'Hay actividad en tus lugares favoritos',
      body: 'Hay actividad en tus lugares favoritos.',
      button: 'Ver mis favoritos',
      path: '/favorites',
    },
    reasonTitle: 'Motivo',
    until: 'Hasta',
    permanent: 'Hasta que el equipo la levante',
    settings: 'Puedes dejar de recibir este aviso en tu perfil de Cruising.',
  },
  en: {
    'spot-live': {
      subject: 'Your spot is live',
      body: 'We reviewed one of the spots you proposed and it is live on the map.',
      button: 'See my spots',
      path: '/my-spots',
    },
    'spot-rejected': {
      subject: "We didn't publish one of your spots",
      body: "We reviewed one of the spots you proposed and didn't publish it. This is why:",
      button: 'See my spots',
      path: '/my-spots',
    },
    'spot-removed': {
      subject: 'We removed one of your spots',
      body: 'After a report, we removed one of the spots you proposed. The removal is final. This is why:',
      button: 'See my spots',
      path: '/my-spots',
    },
    suspended: {
      subject: 'Your Cruising account is suspended',
      body: 'We suspended your Cruising account. You can still browse the map, but not propose spots, write reviews, send reports, check in or send messages.',
      button: 'Read the rules',
      path: '/rules',
    },
    unread: {
      subject: 'You have an unread message',
      body: "Someone wrote to you in Cruising and you haven't read it yet.",
      button: 'Read the message',
      path: '/messages',
    },
    favorites: {
      subject: "There's activity at your favourite spots",
      body: "There's activity at your favourite spots.",
      button: 'See my favourites',
      path: '/favorites',
    },
    reasonTitle: 'Reason',
    until: 'Until',
    permanent: 'Until the team lifts it',
    settings: 'You can stop this email in your Cruising profile.',
  },
};

function formatDay(date: Date, locale: ApiLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** An email to a member about `notice`; `note` is the team's reason, if any. */
export function cruisingNoticeEmail(
  to: string,
  locale: ApiLocale,
  notice: CruisingNotice,
  note: string | null,
  cruisingUrl: string,
  siteUrl: string,
  until: Date | null = null,
): MailMessage {
  const copy = NOTICE_COPY[locale];
  const text = copy[notice];
  return {
    to,
    subject: `${text.subject} — Cruising`,
    ...renderEmail(
      {
        locale,
        preheader: text.body,
        title: text.subject,
        intro: [text.body],
        quote: note ? { title: copy.reasonTitle, body: note } : undefined,
        details:
          notice === 'suspended'
            ? [[copy.until, until ? formatDay(until, locale) : copy.permanent]]
            : undefined,
        button: { label: text.button, url: `${cruisingUrl}/${locale}${text.path}` },
        note:
          notice === 'spot-live' || notice === 'unread' || notice === 'favorites'
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
  counts: { spots: number; reports: number; takedowns: number },
  siteUrl: string,
): MailMessage {
  const total = counts.spots + counts.reports + counts.takedowns;
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
        ],
        button: { label: 'Open Cruising moderation', url: `${siteUrl}/es/admin/cruising` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
