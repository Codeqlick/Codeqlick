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
