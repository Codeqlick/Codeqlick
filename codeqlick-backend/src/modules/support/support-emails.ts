import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

const EXCERPT = 1500;
const excerpt = (text: string) =>
  text.length <= EXCERPT ? text.trim() : `${text.slice(0, EXCERPT).trimEnd()}…`;

type Ticket = { number: number; title: string };

const STATUS_TITLES: Record<ApiLocale, Record<string, string>> = {
  es: {
    IN_PROGRESS: 'Estamos con tu petición',
    WAITING_CLIENT: 'Necesitamos tu respuesta',
    RESOLVED: 'Petición resuelta',
    CLOSED: 'Petición cerrada',
  },
  en: {
    IN_PROGRESS: "We're on your request",
    WAITING_CLIENT: 'We need your reply',
    RESOLVED: 'Request resolved',
    CLOSED: 'Request closed',
  },
};

/** What the new status means for the client, in one sentence. */
function statusIntro(locale: ApiLocale, number: number, code: string, status: string): string {
  const es = locale === 'es';
  switch (code) {
    case 'IN_PROGRESS':
      return es
        ? `Ya estamos trabajando en tu petición #${number}. Te avisamos cuando haya novedades.`
        : `We're now working on your request #${number}. We'll let you know when there's news.`;
    case 'WAITING_CLIENT':
      return es
        ? `Para seguir con tu petición #${number} necesitamos que nos respondas. Puedes hacerlo desde la petición.`
        : `To carry on with your request #${number} we need your reply. You can answer from the request.`;
    case 'RESOLVED':
      return es
        ? `Hemos resuelto tu petición #${number}. Si algo no queda como esperabas, escríbenos en la petición.`
        : `We've resolved your request #${number}. If anything isn't as you expected, write to us on the request.`;
    default:
      return es
        ? `Tu petición #${number} ha pasado a «${status}».`
        : `Your request #${number} is now “${status}”.`;
  }
}

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
          : (STATUS_TITLES[locale][ticket.status] ??
            (es ? 'Tu petición ha cambiado' : 'Your request changed')),
        greeting: es ? `Hola ${client.name}:` : `Hi ${client.name},`,
        intro: [
          replied
            ? es
              ? `${event.authorName} ha respondido a tu petición #${ticket.number}:`
              : `${event.authorName} replied to your request #${ticket.number}:`
            : statusIntro(locale, ticket.number, ticket.status, status),
        ],
        ...(replied
          ? { quote: { title: ticket.title, body: excerpt(event.body) } }
          : {
              details: [
                [es ? 'Petición' : 'Request', `#${ticket.number} ${ticket.title}`],
                [es ? 'Estado' : 'Status', status],
              ] as Array<[string, string]>,
            }),
        button: { label: es ? 'Ver la petición' : 'See the request', url: link },
      },
      siteUrl,
    ),
  };
}
