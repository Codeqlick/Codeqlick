import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';
import type { SubmissionInput } from './site-forms.schemas.js';

/** To the client (Spanish): someone wrote through their site's contact form. */
export function siteFormEmail(
  recipients: string[],
  site: { project: string; url: string | null },
  message: SubmissionInput,
  siteUrl: string,
): MailMessage {
  const where = site.url ? new URL(site.url).host : site.project;
  return {
    to: recipients.join(', '),
    replyTo: message.email,
    subject: `Nuevo mensaje desde ${where}: ${message.name}`,
    ...renderEmail(
      {
        locale: 'es',
        preheader: message.message.slice(0, 120),
        title: 'Nuevo mensaje desde tu web',
        intro: [
          `Alguien ha escrito desde el formulario de contacto de ${where}. Responde a este correo para contestarle directamente.`,
        ],
        details: [
          ['Nombre', message.name],
          ['Email', message.email],
          ...(message.phone ? ([['Teléfono', message.phone]] as Array<[string, string]>) : []),
        ],
        quote: { body: message.message },
        note: 'Codeqlick gestiona el formulario de tu web y no guarda el mensaje: solo te lo envía a ti.',
        signoff: [],
      },
      siteUrl,
    ),
  };
}
