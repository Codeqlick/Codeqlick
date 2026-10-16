import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

type Proposal = {
  number: number;
  title: string;
  currency: string;
  total: number;
  validUntil: string | null;
};

/** Cents as money in the reader's language: "1.250,00 €" / "€1,250.00". */
export function formatMoney(cents: number, currency: string, locale: ApiLocale): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** `yyyy-mm-dd` as a long date: "31 de octubre de 2026". */
function formatDay(day: string, locale: ApiLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

/** To the client, in their language: a proposal is waiting for them. */
export function proposalSentEmail(
  client: { name: string; email: string },
  proposal: Proposal,
  link: string,
  locale: ApiLocale,
  siteUrl: string,
  /** `link` is the invitation to create their account first (decision 17). */
  invitation = false,
): MailMessage {
  const es = locale === 'es';
  const total = formatMoney(proposal.total, proposal.currency, locale);
  const details: Array<[string, string]> = [[es ? 'Importe' : 'Amount', total]];
  if (proposal.validUntil) {
    details.push([es ? 'Válida hasta' : 'Valid until', formatDay(proposal.validUntil, locale)]);
  }
  return {
    to: client.email,
    subject: es
      ? `Propuesta #${proposal.number}: ${proposal.title}`
      : `Proposal #${proposal.number}: ${proposal.title}`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Tu propuesta está lista para revisar: ${total}`
          : `Your proposal is ready to review: ${total}`,
        title: es ? 'Tu propuesta está lista' : 'Your proposal is ready',
        greeting: es ? `Hola ${client.name}:` : `Hi ${client.name},`,
        intro: [
          es
            ? `Te hemos preparado la propuesta «${proposal.title}». Puedes revisarla con calma en tu área de clientes y aceptarla desde allí cuando quieras.`
            : `We've prepared the proposal “${proposal.title}” for you. Take your time to review it in your client area, and accept it there whenever you're ready.`,
          ...(invitation
            ? [
                es
                  ? `Tu área de clientes te espera: crea tu cuenta con ${client.email} y la propuesta estará dentro.`
                  : `Your client area is waiting: create your account with ${client.email} and the proposal will be there.`,
              ]
            : []),
        ],
        details,
        button: {
          label: invitation
            ? es
              ? 'Crear mi cuenta y verla'
              : 'Create my account and see it'
            : es
              ? 'Ver la propuesta'
              : 'See the proposal',
          url: link,
        },
        outro: [
          es
            ? 'Si tienes cualquier duda o quieres cambiar algo, responde a este correo.'
            : 'If you have any questions or want to change anything, just reply to this email.',
        ],
      },
      siteUrl,
    ),
  };
}

/** To the team (English, like the other team notifications): the client answered. */
export function proposalAnsweredEmail(
  to: string,
  client: { name: string; email: string },
  proposal: Proposal,
  answer: { kind: 'accepted'; name: string } | { kind: 'declined'; reason: string | null },
  link: string,
  siteUrl: string,
): MailMessage {
  const accepted = answer.kind === 'accepted';
  const total = formatMoney(proposal.total, proposal.currency, 'en');
  return {
    to,
    replyTo: client.email,
    subject: `Proposal #${proposal.number} ${accepted ? 'accepted' : 'declined'}: ${proposal.title}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: `${client.name} ${accepted ? 'accepted' : 'declined'} ${proposal.title} (${total})`,
        title: accepted
          ? `${client.name} accepted the proposal`
          : `${client.name} declined the proposal`,
        intro: [
          accepted
            ? `${client.name} accepted proposal #${proposal.number}, signing as “${answer.name}”.`
            : `${client.name} declined proposal #${proposal.number}.`,
        ],
        details: [
          ['Proposal', proposal.title],
          ['Amount', total],
        ],
        quote:
          answer.kind === 'declined' && answer.reason
            ? { title: 'Their reason', body: answer.reason }
            : undefined,
        button: { label: 'Open in the admin panel', url: link },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
