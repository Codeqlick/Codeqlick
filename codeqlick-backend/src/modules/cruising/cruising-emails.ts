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

const TAKEDOWN_COPY = {
  es: {
    receivedSubject: 'Hemos recibido tu solicitud de retirada',
    receivedTitle: 'Solicitud recibida',
    received:
      'Hemos recibido tu solicitud de retirada de Cruising. Si se trata de un menor o de algo ilegal (o, para una foto o un vídeo, de falta de consentimiento o de una imagen robada) y coincide con algo publicado, ya está oculto. La revisamos y te respondemos en 24 horas como máximo.',
    removedSubject: 'Hemos retirado el contenido',
    removedTitle: 'Contenido retirado',
    removed: 'Hemos revisado tu solicitud y retirado lo que pedías.',
    closedSubject: 'Hemos revisado tu solicitud de retirada',
    closedTitle: 'Solicitud revisada',
    closed: 'Hemos revisado tu solicitud y no hemos retirado nada.',
    answer: 'Respuesta del equipo',
    reference: 'Referencia de la solicitud',
  },
  en: {
    receivedSubject: 'We received your removal request',
    receivedTitle: 'Request received',
    received:
      'We received your removal request for Cruising. If it is about a minor or something illegal (or, for a photo or video, missing consent or a stolen image) and it matched something published, it is hidden already. We review it and answer within 24 hours.',
    removedSubject: 'We removed the content',
    removedTitle: 'Content removed',
    removed: 'We reviewed your request and removed what you asked about.',
    closedSubject: 'We reviewed your removal request',
    closedTitle: 'Request reviewed',
    closed: 'We reviewed your request and did not remove anything.',
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
  | 'spot-live'
  | 'spot-rejected'
  | 'spot-removed'
  | 'suspended'
  | 'unread'
  | 'verification-approved'
  | 'verification-rejected'
  | 'verification-withdrawn'
  | 'media-removed';

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
    'verification-approved': {
      subject: 'Tu perfil está verificado',
      body: 'Hemos revisado tu foto de verificación: tu perfil lleva la insignia «Verificado» y ya puedes subir fotos y vídeos.',
      button: 'Ir a mi perfil',
      path: '/me',
    },
    'verification-rejected': {
      subject: 'No hemos podido verificar tu perfil',
      body: 'Hemos revisado tu foto de verificación y no la hemos aprobado. Hemos borrado la foto. Puedes enviar otra. Este es el motivo:',
      button: 'Ir a mi perfil',
      path: '/me',
    },
    'verification-withdrawn': {
      subject: 'Tu perfil ya no está verificado',
      body: 'El equipo ha retirado la verificación de tu perfil: ya no lleva la insignia «Verificado» ni puedes subir fotos o vídeos.',
      button: 'Leer las normas',
      path: '/rules',
    },
    'media-removed': {
      subject: 'Hemos retirado una de tus fotos o vídeos',
      body: 'Tras revisarla, hemos retirado una foto o un vídeo de tu perfil y no se puede volver a subir. Este es el motivo:',
      button: 'Ir a mi perfil',
      path: '/me',
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
    'verification-approved': {
      subject: 'Your profile is verified',
      body: 'We reviewed your verification photo: your profile carries the "Verified" badge and you can upload photos and videos.',
      button: 'Go to my profile',
      path: '/me',
    },
    'verification-rejected': {
      subject: "We couldn't verify your profile",
      body: "We reviewed your verification photo and didn't approve it. We deleted the photo. You can send another one. This is why:",
      button: 'Go to my profile',
      path: '/me',
    },
    'verification-withdrawn': {
      subject: 'Your profile is no longer verified',
      body: 'The team withdrew the verification of your profile: it no longer carries the "Verified" badge and you can no longer upload photos or videos.',
      button: 'Read the rules',
      path: '/rules',
    },
    'media-removed': {
      subject: 'We removed one of your photos or videos',
      body: "After reviewing it, we removed a photo or video from your profile, and it can't be uploaded again. This is why:",
      button: 'Go to my profile',
      path: '/me',
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
        note: notice === 'spot-live' || notice === 'unread' ? copy.settings : undefined,
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
