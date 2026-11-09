import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** What every Citas email needs to know about the appointment. */
export interface AppointmentFacts {
  pageTitle: string;
  ownerName: string;
  ownerEmail: string;
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  location: string;
  /** The Meetings link, when the page offers a video call. */
  videoUrl: string | null;
}

const SIGNOFF = ['Citas · Codeqlick'];

/** "jueves, 22 de octubre de 2026, 10:00" in the page's time zone. */
export function appointmentTime(date: Date, timeZone: string, locale: ApiLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

/** "Europe/Madrid" → "hora de Europe/Madrid" / "Europe/Madrid time". */
function zoneLabel(timeZone: string, locale: ApiLocale): string {
  const city = timeZone.split('/').pop()!.replace(/_/g, ' ');
  return locale === 'es' ? `hora de ${city}` : `${city} time`;
}

function where(facts: AppointmentFacts, locale: ApiLocale): Array<[string, string]> {
  const es = locale === 'es';
  const rows: Array<[string, string]> = [];
  if (facts.location) rows.push([es ? 'Dónde' : 'Where', facts.location]);
  if (facts.videoUrl) rows.push([es ? 'Videollamada' : 'Video call', facts.videoUrl]);
  return rows;
}

/** To whoever booked, in their language: it's booked, where, and how to cancel. */
export function appointmentConfirmedEmail(
  facts: AppointmentFacts,
  cancelUrl: string,
  locale: ApiLocale,
  siteUrl: string,
  ics: string,
): MailMessage {
  const es = locale === 'es';
  const when = appointmentTime(facts.startsAt, facts.timeZone, locale);
  return {
    to: facts.email,
    replyTo: facts.ownerEmail,
    subject: es
      ? `Cita reservada: ${facts.pageTitle}, ${when}`
      : `Booked: ${facts.pageTitle}, ${when}`,
    icalEvent: { method: 'REQUEST', content: ics },
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `${facts.ownerName} te espera el ${when}.`
          : `${facts.ownerName} expects you on ${when}.`,
        title: es ? 'Tu cita está reservada' : 'Your appointment is booked',
        greeting: es ? `Hola ${facts.name}:` : `Hi ${facts.name},`,
        intro: [
          es
            ? `Has reservado «${facts.pageTitle}» con ${facts.ownerName}.`
            : `You booked "${facts.pageTitle}" with ${facts.ownerName}.`,
        ],
        details: [
          [es ? 'Cuándo' : 'When', `${when} (${zoneLabel(facts.timeZone, locale)})`],
          ...where(facts, locale),
        ],
        button: facts.videoUrl
          ? { label: es ? 'Entrar a la videollamada' : 'Join the video call', url: facts.videoUrl }
          : undefined,
        outro: [
          es
            ? `Te adjuntamos la invitación para tu calendario. Si quieres decirle algo a ${facts.ownerName}, responde a este correo.`
            : `The invitation for your calendar is attached. To tell ${facts.ownerName} something, reply to this email.`,
        ],
        note: es
          ? `¿No puedes ir al final? Cancela la cita aquí: ${cancelUrl}`
          : `Can't make it after all? Cancel it here: ${cancelUrl}`,
        signoff: SIGNOFF,
      },
      siteUrl,
    ),
  };
}

/** To the page's owner, in their language: someone booked. */
export function appointmentOwnerEmail(
  facts: AppointmentFacts,
  panelUrl: string,
  locale: ApiLocale,
  siteUrl: string,
  ics: string,
): MailMessage {
  const es = locale === 'es';
  const when = appointmentTime(facts.startsAt, facts.timeZone, locale);
  const details: Array<[string, string]> = [
    [es ? 'Cuándo' : 'When', `${when} (${zoneLabel(facts.timeZone, locale)})`],
    [es ? 'Nombre' : 'Name', facts.name],
    [es ? 'Correo' : 'Email', facts.email],
  ];
  if (facts.phone) details.push([es ? 'Teléfono' : 'Phone', facts.phone]);
  details.push(...where(facts, locale));
  return {
    to: facts.ownerEmail,
    replyTo: facts.email,
    subject: es ? `Nueva cita: ${facts.name}, ${when}` : `New appointment: ${facts.name}, ${when}`,
    icalEvent: { method: 'REQUEST', content: ics },
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `${facts.name} ha reservado «${facts.pageTitle}».`
          : `${facts.name} booked "${facts.pageTitle}".`,
        title: es ? 'Tienes una cita nueva' : 'You have a new appointment',
        intro: [
          es
            ? `${facts.name} ha reservado «${facts.pageTitle}». Responde a este correo para escribirle.`
            : `${facts.name} booked "${facts.pageTitle}". Reply to this email to write to them.`,
        ],
        details,
        quote: facts.note ? { title: es ? 'Su nota' : 'Their note', body: facts.note } : undefined,
        button: { label: es ? 'Ver mis citas' : 'See my appointments', url: panelUrl },
        signoff: SIGNOFF,
      },
      siteUrl,
    ),
  };
}

/** Tells the other side that an appointment was cancelled (with the calendar cancellation). */
export function appointmentCancelledEmail(
  facts: AppointmentFacts,
  to: 'owner' | 'booker',
  locale: ApiLocale,
  siteUrl: string,
  ics: string,
  bookAgainUrl: string,
): MailMessage {
  const es = locale === 'es';
  const when = appointmentTime(facts.startsAt, facts.timeZone, locale);
  const toOwner = to === 'owner';
  return {
    to: toOwner ? facts.ownerEmail : facts.email,
    replyTo: toOwner ? facts.email : facts.ownerEmail,
    subject: es
      ? `Cita cancelada: ${facts.pageTitle}, ${when}`
      : `Cancelled: ${facts.pageTitle}, ${when}`,
    icalEvent: { method: 'CANCEL', content: ics },
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `La cita del ${when} se ha cancelado.`
          : `The appointment on ${when} was cancelled.`,
        title: es ? 'Cita cancelada' : 'Appointment cancelled',
        greeting: toOwner ? undefined : es ? `Hola ${facts.name}:` : `Hi ${facts.name},`,
        intro: [
          toOwner
            ? es
              ? `${facts.name} (${facts.email}) ha cancelado «${facts.pageTitle}» del ${when}. Ese hueco vuelve a estar libre.`
              : `${facts.name} (${facts.email}) cancelled "${facts.pageTitle}" on ${when}. That time is free again.`
            : es
              ? `${facts.ownerName} ha cancelado «${facts.pageTitle}» del ${when}. Responde a este correo para hablar con ${facts.ownerName}, o reserva otra hora.`
              : `${facts.ownerName} cancelled "${facts.pageTitle}" on ${when}. Reply to this email to talk to ${facts.ownerName}, or book another time.`,
        ],
        button: toOwner
          ? undefined
          : { label: es ? 'Reservar otra hora' : 'Book another time', url: bookAgainUrl },
        signoff: SIGNOFF,
      },
      siteUrl,
    ),
  };
}

/**
 * To whoever booked, about 24 h before, in their language: when and where, the video link, and
 * how to cancel (the link in the confirmation email: only its hash is stored, so it can't be
 * sent again) or tell the owner something (reply).
 */
export function appointmentReminderEmail(
  facts: AppointmentFacts,
  locale: ApiLocale,
  siteUrl: string,
  pageUrl: string,
): MailMessage {
  const es = locale === 'es';
  const when = appointmentTime(facts.startsAt, facts.timeZone, locale);
  return {
    to: facts.email,
    replyTo: facts.ownerEmail,
    subject: es
      ? `Recordatorio: ${facts.pageTitle}, ${when}`
      : `Reminder: ${facts.pageTitle}, ${when}`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Mañana tienes cita con ${facts.ownerName}.`
          : `You have an appointment with ${facts.ownerName} tomorrow.`,
        title: es ? 'Tu cita es mañana' : 'Your appointment is tomorrow',
        greeting: es ? `Hola ${facts.name}:` : `Hi ${facts.name},`,
        intro: [
          es
            ? `Te recordamos tu cita «${facts.pageTitle}» con ${facts.ownerName}.`
            : `A reminder of your appointment "${facts.pageTitle}" with ${facts.ownerName}.`,
        ],
        details: [
          [es ? 'Cuándo' : 'When', `${when} (${zoneLabel(facts.timeZone, locale)})`],
          ...where(facts, locale),
        ],
        button: facts.videoUrl
          ? { label: es ? 'Entrar a la videollamada' : 'Join the video call', url: facts.videoUrl }
          : undefined,
        outro: [
          es
            ? `Si quieres decirle algo a ${facts.ownerName}, responde a este correo.`
            : `To tell ${facts.ownerName} something, reply to this email.`,
        ],
        note: es
          ? `¿No puedes ir? Cancela con el enlace de tu correo de confirmación, así el hueco queda libre para otra persona. Página de reservas: ${pageUrl}`
          : `Can't make it? Cancel with the link in your confirmation email, so someone else can take the time. Booking page: ${pageUrl}`,
        signoff: SIGNOFF,
      },
      siteUrl,
    ),
  };
}
