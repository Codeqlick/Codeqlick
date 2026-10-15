import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

const EXCERPT = 1500;
const excerpt = (text: string) =>
  text.length <= EXCERPT ? text.trim() : `${text.slice(0, EXCERPT).trimEnd()}…`;

type Ticket = { number: number; title: string };

const STATUS: Record<ApiLocale, Record<string, string>> = {
  es: {
    OPEN: 'Abierta',
    IN_PROGRESS: 'En curso',
    WAITING_CLIENT: 'Esperando tu respuesta',
    RESOLVED: 'Resuelta',
    CLOSED: 'Cerrada',
  },
  en: {
    OPEN: 'Open',
    IN_PROGRESS: 'In progress',
    WAITING_CLIENT: 'Waiting for your reply',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  },
};

/** To the team (English, like the other team notifications): a client opened or answered one. */
export function ticketTeamEmail(
  to: string,
  client: { name: string; email: string },
  ticket: Ticket & { type: string; priority: string },
  event: { kind: 'opened' | 'replied'; body: string },
  link: string,
  siteUrl: string,
): MailMessage {
  const opened = event.kind === 'opened';
  return {
    to,
    replyTo: client.email,
    subject: `${opened ? 'New support request' : 'Reply'} #${ticket.number}: ${ticket.title}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: excerpt(event.body).slice(0, 120),
        title: opened ? `New request from ${client.name}` : `${client.name} replied`,
        intro: [
          opened
            ? `${client.name} opened request #${ticket.number} from the client area.`
            : `${client.name} replied on request #${ticket.number}.`,
        ],
        details: opened
          ? [
              ['Type', ticket.type],
              ['Priority', ticket.priority],
            ]
          : undefined,
        quote: { title: ticket.title, body: excerpt(event.body) },
        button: { label: 'Open in the admin panel', url: link },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** To the client, in their language: the team answered, or the request changed status. */
export function ticketClientEmail(
  client: { name: string; email: string },
  ticket: Ticket & { status: string },
  event: { kind: 'replied'; body: string; authorName: string } | { kind: 'status' },
  link: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  const status = STATUS[locale][ticket.status] ?? ticket.status;
  const replied = event.kind === 'replied';
  return {
    to: client.email,
    subject: replied
      ? es
        ? `Respuesta a tu petición #${ticket.number}`
        : `Reply to your request #${ticket.number}`
      : es
        ? `Tu petición #${ticket.number}: ${status}`
        : `Your request #${ticket.number}: ${status}`,
    ...renderEmail(
      {
        locale,
        preheader: replied ? excerpt(event.body).slice(0, 120) : `${ticket.title} — ${status}`,
        title: replied
          ? es
            ? 'Tenemos respuesta a tu petición'
            : "We've answered your request"
          : es
            ? `Petición ${status.toLowerCase()}`
            : `Request ${status.toLowerCase()}`,
        greeting: es ? `Hola ${client.name}:` : `Hi ${client.name},`,
        intro: [
          replied
            ? es
              ? `${event.authorName} ha respondido a tu petición #${ticket.number}:`
              : `${event.authorName} replied to your request #${ticket.number}:`
            : es
              ? `Tu petición #${ticket.number} ha pasado a «${status}».`
              : `Your request #${ticket.number} is now “${status}”.`,
        ],
        quote: { title: ticket.title, body: replied ? excerpt(event.body) : status },
        button: { label: es ? 'Ver la petición' : 'See the request', url: link },
      },
      siteUrl,
    ),
  };
}
