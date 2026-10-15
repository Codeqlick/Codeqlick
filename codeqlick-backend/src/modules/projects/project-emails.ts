import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
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
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: client.email,
    subject: `${project.name}: ${update.title}`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Novedad en ${project.name}: ${update.title}`
          : `Update on ${project.name}: ${update.title}`,
        title: es ? `Novedad en ${project.name}` : `Update on ${project.name}`,
        greeting: es ? `Hola ${client.name}:` : `Hi ${client.name},`,
        intro: [
          es
            ? 'Hemos publicado una novedad en tu proyecto:'
            : "We've posted an update on your project:",
        ],
        quote: { title: update.title, body: excerpt(update.body) },
        button: { label: es ? 'Ver el proyecto' : 'View the project', url: link },
      },
      siteUrl,
    ),
  };
}
