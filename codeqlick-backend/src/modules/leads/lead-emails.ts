import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

interface LeadForEmail {
  id: string;
  name: string;
  email: string;
  company: string | null;
  budget: string | null;
  message: string;
  locale: ApiLocale;
}

/** Internal notification for the Codeqlick team, with a link to the lead in the admin panel. */
export function leadNotificationEmail(
  to: string,
  lead: LeadForEmail,
  siteUrl: string,
): MailMessage {
  return {
    to,
    replyTo: lead.email,
    subject: `New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: lead.message.slice(0, 120),
        title: `New lead: ${lead.name}`,
        intro: ['Someone filled in the contact form. Reply to this email to answer them.'],
        details: [
          ['Name', lead.name],
          ['Email', lead.email],
          ['Company', lead.company ?? '-'],
          ['Budget', lead.budget ?? '-'],
          ['Locale', lead.locale],
          ['Lead id', lead.id],
        ],
        quote: { body: lead.message },
        button: { label: 'Open in the admin panel', url: `${siteUrl}/es/admin/leads/${lead.id}` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** Acknowledgement for the person who filled in the contact form, in their language. */
export function leadAcknowledgementEmail(lead: LeadForEmail, siteUrl: string): MailMessage {
  const es = lead.locale === 'es';
  return {
    to: lead.email,
    subject: es ? 'Hemos recibido tu mensaje — Codeqlick' : 'We received your message — Codeqlick',
    ...renderEmail(
      {
        locale: lead.locale,
        preheader: es
          ? 'Te responderemos en un plazo de dos días laborables.'
          : 'We will get back to you within two business days.',
        title: es ? 'Hemos recibido tu mensaje' : 'We received your message',
        greeting: es ? `Hola ${lead.name}:` : `Hi ${lead.name},`,
        intro: [
          es
            ? 'Gracias por escribirnos. Te responderemos en un plazo de dos días laborables. Mientras tanto, esto es lo que nos has enviado:'
            : "Thanks for reaching out. We'll get back to you within two business days. In the meantime, here is what you sent us:",
        ],
        quote: { title: es ? 'Tu mensaje' : 'Your message', body: lead.message },
      },
      siteUrl,
    ),
  };
}

/**
 * An answer written in the admin panel. The text goes out as written (paragraphs split on blank
 * lines), with the visitor's original message quoted below it.
 */
export function leadReplyEmail(
  lead: Pick<LeadForEmail, 'email' | 'message' | 'locale'>,
  reply: { subject: string; body: string },
  siteUrl: string,
): MailMessage {
  const es = lead.locale === 'es';
  const paragraphs = reply.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return {
    to: lead.email,
    subject: reply.subject,
    ...renderEmail(
      {
        locale: lead.locale,
        preheader: paragraphs[0]?.slice(0, 120) ?? reply.subject,
        intro: paragraphs,
        quote: { title: es ? 'Tu mensaje' : 'Your message', body: lead.message },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
