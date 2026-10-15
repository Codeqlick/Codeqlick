import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { MailMessage } from '../mail/mail.service.js';

/** Longest part of an update's text quoted in the email; the portal has the rest. */
export const UPDATE_EXCERPT_CHARS = 1500;

function excerpt(body: string): string {
  const text = body.trim();
  if (text.length <= UPDATE_EXCERPT_CHARS) return text;
  return `${text.slice(0, UPDATE_EXCERPT_CHARS).trimEnd()}…`;
}

/** Tells the client a new update was posted on their project, in their language. */
export function projectUpdateEmail(
  client: { name: string; email: string },
  project: { name: string },
  update: { title: string; body: string },
  link: string,
  locale: ApiLocale,
): MailMessage {
  if (locale === 'es') {
    return {
      to: client.email,
      subject: `${project.name}: ${update.title}`,
      text: [
        `Hola ${client.name}:`,
        '',
        `Hay una novedad en tu proyecto ${project.name}.`,
        '',
        update.title,
        '',
        excerpt(update.body),
        '',
        'Puedes verla, junto con el estado y los archivos del proyecto, en tu área de cliente:',
        link,
        '',
        'Un saludo,',
        'El equipo de Codeqlick',
      ].join('\n'),
    };
  }
  return {
    to: client.email,
    subject: `${project.name}: ${update.title}`,
    text: [
      `Hi ${client.name},`,
      '',
      `There's a new update on your project ${project.name}.`,
      '',
      update.title,
      '',
      excerpt(update.body),
      '',
      "You can see it, along with the project's status and files, in your client portal:",
      link,
      '',
      'Best regards,',
      'The Codeqlick team',
    ].join('\n'),
  };
}
