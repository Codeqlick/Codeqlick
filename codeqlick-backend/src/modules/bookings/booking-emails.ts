import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';
import { TIME_ZONE } from './booking-time.js';

type Call = {
  name: string;
  email: string;
  company: string | null;
  message: string | null;
  startsAt: Date;
  endsAt: Date;
};

/** "jueves, 22 de octubre de 2026, 10:00" (Madrid time). */
export function callTime(date: Date, locale: ApiLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    timeZone: TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

const minutes = (call: Call) =>
  Math.round((call.endsAt.getTime() - call.startsAt.getTime()) / 60_000);

/** To the visitor, in their language: the call is booked, with the link and how to cancel. */
export function bookingConfirmedEmail(
  call: Call,
  meetingUrl: string,
  cancelUrl: string,
  locale: ApiLocale,
  siteUrl: string,
  ics: string,
): MailMessage {
  const es = locale === 'es';
  const when = callTime(call.startsAt, locale);
  return {
    to: call.email,
    subject: es ? `Llamada con Codeqlick: ${when}` : `Call with Codeqlick: ${when}`,
    icalEvent: { method: 'REQUEST', content: ics },
    ...renderEmail(
      {
        locale,
        preheader: es ? `Te esperamos el ${when}.` : `See you on ${when}.`,
        title: es ? 'Tu llamada está reservada' : 'Your call is booked',
        greeting: es ? `Hola ${call.name}:` : `Hi ${call.name},`,
        intro: [
          es
            ? `Gracias por reservar una llamada. Hablaremos ${minutes(call)} minutos por videollamada (Google Meet): solo tienes que entrar por el enlace a la hora indicada, desde el navegador o el móvil.`
            : `Thanks for booking a call. We'll talk for ${minutes(call)} minutes over video (Google Meet): just join from the link at the time below, in your browser or on your phone.`,
        ],
        details: [
          [es ? 'Cuándo' : 'When', `${when} (${es ? 'hora de Madrid' : 'Madrid time'})`],
          [es ? 'Dónde' : 'Where', meetingUrl],
        ],
        button: { label: es ? 'Unirme a la videollamada' : 'Join the call', url: meetingUrl },
        outro: [
          es
            ? 'Te adjuntamos la invitación para añadirla a tu calendario. Si quieres contarnos algo antes, responde a este correo.'
            : "The invitation is attached so you can add it to your calendar. If you'd like to tell us something beforehand, just reply to this email.",
        ],
        note: es
          ? `¿No puedes al final? Cancela la llamada aquí: ${cancelUrl}`
          : `Can't make it after all? Cancel the call here: ${cancelUrl}`,
      },
      siteUrl,
    ),
  };
}

/** To the team (English): a new call, with the invitation for the team's calendar. */
export function bookingTeamEmail(
  to: string,
  call: Call,
  adminUrl: string,
  siteUrl: string,
  ics: string,
): MailMessage {
  const when = callTime(call.startsAt, 'en');
  const details: Array<[string, string]> = [
    ['When', `${when} (Madrid time)`],
    ['Name', call.name],
    ['Email', call.email],
  ];
  if (call.company) details.push(['Company', call.company]);
  return {
    to,
    replyTo: call.email,
    subject: `Call booked: ${call.name}, ${when}`,
    icalEvent: { method: 'REQUEST', content: ics },
    ...renderEmail(
      {
        locale: 'en',
        preheader: `${call.name} booked a call for ${when}.`,
        title: 'A call was booked',
        intro: [`${call.name} booked a ${minutes(call)}-minute call from the website.`],
        details,
        quote: call.message
          ? { title: 'What they want to talk about', body: call.message }
          : undefined,
        button: { label: 'Open the bookings', url: adminUrl },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** Tells the other side that a call was cancelled (with the calendar cancellation). */
export function bookingCancelledEmail(
  to: { email: string; name: string },
  call: Call,
  byVisitor: boolean,
  locale: ApiLocale,
  siteUrl: string,
  ics: string,
): MailMessage {
  const es = locale === 'es';
  const when = callTime(call.startsAt, locale);
  return {
    to: to.email,
    ...(byVisitor ? { replyTo: call.email } : {}),
    subject: es ? `Llamada cancelada: ${when}` : `Call cancelled: ${when}`,
    icalEvent: { method: 'CANCEL', content: ics },
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `La llamada del ${when} se ha cancelado.`
          : `The call on ${when} was cancelled.`,
        title: es ? 'Llamada cancelada' : 'Call cancelled',
        greeting: byVisitor ? undefined : es ? `Hola ${call.name}:` : `Hi ${call.name},`,
        intro: [
          byVisitor
            ? `${call.name} (${call.email}) cancelled the call on ${when}.`
            : es
              ? `Hemos tenido que cancelar la llamada del ${when}. Responde a este correo y buscamos otro momento.`
              : `We've had to cancel the call on ${when}. Reply to this email and we'll find another time.`,
        ],
        signoff: byVisitor ? [] : undefined,
      },
      siteUrl,
    ),
  };
}

/** To the owner's calendar address when the team cancelled: removes the call from it. */
export function bookingRemovedFromCalendarEmail(
  to: string,
  call: Call,
  siteUrl: string,
  ics: string,
): MailMessage {
  const when = callTime(call.startsAt, 'en');
  return {
    to,
    subject: `Call cancelled: ${call.name}, ${when}`,
    icalEvent: { method: 'CANCEL', content: ics },
    ...renderEmail(
      {
        locale: 'en',
        preheader: `The call with ${call.name} on ${when} was cancelled.`,
        title: 'Call cancelled',
        intro: [
          `The call with ${call.name} on ${when} was cancelled from the admin panel; ${call.name} has been told.`,
        ],
        signoff: [],
      },
      siteUrl,
    ),
  };
}
