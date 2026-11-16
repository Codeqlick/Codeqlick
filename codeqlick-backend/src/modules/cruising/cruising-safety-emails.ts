/**
 * The emails of Cruising's safety and health features (architecture 4.15, phase 5). What goes to a
 * trusted contact speaks of "Codeqlick safety alerts" only: never the app, a nickname or anything
 * sexual. What goes to the member says nothing beyond what the notice is.
 */
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

const INVITE_COPY = {
  en: {
    subject: (name: string) => `${name} asked you to receive their Codeqlick safety alerts`,
    title: 'Codeqlick safety alerts',
    intro: (name: string) => [
      `${name} would like you to be one of their trusted contacts for Codeqlick safety alerts.`,
      `When ${name} goes out to meet someone, they can start a safety timer. If they don't end it in time, we email you their message, the time and, if they choose to share it, the place, so you can check they're OK.`,
      "You'll get nothing else from us, and you can stop at any time.",
    ],
    button: 'Accept or refuse',
    outro: (stopUrl: string) => [`Stop these alerts at any time: ${stopUrl}`],
    note: (name: string) =>
      `If you don't know ${name} or don't want this, refuse it or ignore this email: nothing will be sent to you.`,
  },
  es: {
    subject: (name: string) => `${name} te pide recibir sus alertas de seguridad de Codeqlick`,
    title: 'Alertas de seguridad de Codeqlick',
    intro: (name: string) => [
      `A ${name} le gustaría que fueras uno de sus contactos de confianza para las alertas de seguridad de Codeqlick.`,
      `Cuando ${name} queda con alguien, puede activar un temporizador de seguridad. Si no lo termina a tiempo, te enviamos un email con su mensaje, la hora y, si decide compartirlo, el lugar, para que compruebes que está bien.`,
      'No recibirás nada más de nuestra parte y puedes dejarlo cuando quieras.',
    ],
    button: 'Aceptar o rechazar',
    outro: (stopUrl: string) => [`Deja de recibir estas alertas cuando quieras: ${stopUrl}`],
    note: (name: string) =>
      `Si no conoces a ${name} o no quieres recibirlas, recházalo o ignora este email: no te enviaremos nada.`,
  },
} as const;

/** The double opt-in invitation to a trusted contact, in the member's language. */
export function contactInviteEmail(
  to: string,
  locale: ApiLocale,
  displayName: string,
  answerUrl: string,
  stopUrl: string,
  siteUrl: string,
): MailMessage {
  const copy = INVITE_COPY[locale];
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

const ALERT_COPY = {
  en: {
    subject: (name: string) => `Codeqlick safety alert: ${name} hasn't checked in`,
    title: 'Codeqlick safety alert',
    intro: (name: string) => [
      `${name} started a safety timer and didn't end it in time. They asked us to tell you, so you can check they're OK.`,
      'Try to reach them. If you think they are in danger, call the emergency services (112 in Europe).',
    ],
    message: 'Their message',
    time: 'Ran out at',
    place: 'Place',
    map: 'Map',
    button: 'See the place on a map',
    outro: (stopUrl: string) => [`Stop these alerts: ${stopUrl}`],
    note: 'You get this because you accepted to be a trusted contact. This is the only email this timer sends.',
  },
  es: {
    subject: (name: string) =>
      `Alerta de seguridad de Codeqlick: ${name} no ha confirmado que está bien`,
    title: 'Alerta de seguridad de Codeqlick',
    intro: (name: string) => [
      `${name} activó un temporizador de seguridad y no lo terminó a tiempo. Nos pidió que te avisáramos para que compruebes que está bien.`,
      'Intenta contactar con esa persona. Si crees que está en peligro, llama a los servicios de emergencia (112 en Europa).',
    ],
    message: 'Su mensaje',
    time: 'Terminó a las',
    place: 'Lugar',
    map: 'Mapa',
    button: 'Ver el lugar en un mapa',
    outro: (stopUrl: string) => [`Dejar de recibir estas alertas: ${stopUrl}`],
    note: 'Lo recibes porque aceptaste ser contacto de confianza. Es el único email que envía este temporizador.',
  },
} as const;

/** To an ACCEPTED contact when a timer runs out unended: only what the member chose to share. */
export function contactAlertEmail(
  to: string,
  locale: ApiLocale,
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
  const copy = ALERT_COPY[locale];
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

const MEMBER_COPY = {
  en: {
    timer: {
      subject: 'Your safety timer ends in 10 minutes',
      body: "Extend it or end it if you're fine. If it runs out, your trusted contacts get an email.",
      button: 'Open my timer',
      path: '/me#timer',
    },
    health: {
      subject: 'Time for your check-up',
      body: 'Time for your check-up.',
      button: 'Find a testing centre',
      path: '/health',
    },
    settings: 'You can change this in your Cruising profile.',
  },
  es: {
    timer: {
      subject: 'Tu temporizador de seguridad termina en 10 minutos',
      body: 'Amplíalo o termínalo si estás bien. Si se agota, tus contactos de confianza recibirán un email.',
      button: 'Abrir mi temporizador',
      path: '/me#timer',
    },
    health: {
      subject: 'Es hora de tu revisión',
      body: 'Es hora de tu revisión.',
      button: 'Buscar un centro de pruebas',
      path: '/health',
    },
    settings: 'Puedes cambiarlo en tu perfil de Cruising.',
  },
} as const;

/** To the member: their timer is about to run out, or their check-up is due (nothing more). */
export function memberSafetyEmail(
  to: string,
  locale: ApiLocale,
  kind: 'timer' | 'health',
  cruisingUrl: string,
  siteUrl: string,
): MailMessage {
  const copy = MEMBER_COPY[locale];
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
        button: { label: text.button, url: `${cruisingUrl}/${locale}${text.path}` },
        note: kind === 'health' ? copy.settings : undefined,
        signoff: [],
      },
      siteUrl,
    ),
  };
}

const PUSH_COPY = {
  en: { timer: 'Your safety timer ends in 10 minutes', health: 'Time for your check-up' },
  es: {
    timer: 'Tu temporizador de seguridad termina en 10 minutos',
    health: 'Es hora de tu revisión',
  },
} as const;

/** A push of the timer's reminder or the check-up reminder. */
export function safetyPushPayload(
  kind: 'timer' | 'health',
  locale: ApiLocale,
): { title: string; body: string; url: string; tag: string } {
  return {
    title: 'Cruising',
    body: PUSH_COPY[locale][kind],
    url: `/${locale}/me#${kind}`,
    tag: `cruising-${kind}`,
  };
}
