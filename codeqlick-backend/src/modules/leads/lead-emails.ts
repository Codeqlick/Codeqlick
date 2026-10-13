import type { ApiLocale } from '../../common/schemas/common.schemas.js';
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

/** Internal notification for the Codeqlick team. */
export function leadNotificationEmail(to: string, lead: LeadForEmail): MailMessage {
  return {
    to,
    replyTo: lead.email,
    subject: `New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    text: [
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      `Company: ${lead.company ?? '-'}`,
      `Budget: ${lead.budget ?? '-'}`,
      `Locale: ${lead.locale}`,
      `Lead id: ${lead.id}`,
      '',
      lead.message,
    ].join('\n'),
  };
}

/** Acknowledgement for the person who filled in the contact form, in their language. */
export function leadAcknowledgementEmail(lead: LeadForEmail): MailMessage {
  if (lead.locale === 'es') {
    return {
      to: lead.email,
      subject: 'Hemos recibido tu mensaje — Codeqlick',
      text: [
        `Hola ${lead.name}:`,
        '',
        'Gracias por escribirnos. Hemos recibido tu mensaje y te responderemos en un plazo de dos días laborables.',
        '',
        'Un saludo,',
        'El equipo de Codeqlick',
      ].join('\n'),
    };
  }
  return {
    to: lead.email,
    subject: 'We received your message — Codeqlick',
    text: [
      `Hi ${lead.name},`,
      '',
      'Thanks for reaching out. We have received your message and will get back to you within two business days.',
      '',
      'Best regards,',
      'The Codeqlick team',
    ].join('\n'),
  };
}
