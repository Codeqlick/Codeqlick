import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** To a person of the client account, in their language: please fill in the project brief. */
export function briefRequestEmail(
  person: { name: string; email: string },
  project: { name: string },
  link: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: person.email,
    subject: es
      ? `${project.name}: cuéntanos tu proyecto`
      : `${project.name}: tell us about your project`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Unas preguntas para empezar con buen pie.'
          : 'A few questions to get off to a good start.',
        title: es ? 'Cuéntanos tu proyecto' : 'Tell us about your project',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: [
          es
            ? `Para preparar ${project.name} necesitamos conocerlo bien: qué quieres conseguir, para quién, qué no puede faltar, tu marca y tus plazos. Son unas preguntas que puedes responder en tu área de clientes; se guarda lo que escribes, así que puedes hacerlo en varias veces.`
            : `To get ${project.name} ready we need to know it well: what you want to achieve, who it's for, what it can't do without, your brand and your deadlines. It's a few questions in your client area; what you type is saved, so you can do it in several goes.`,
        ],
        button: { label: es ? 'Responder las preguntas' : 'Answer the questions', url: link },
      },
      siteUrl,
    ),
  };
}

/** To the team (English): the client sent the brief. */
export function briefSubmittedEmail(
  to: string,
  person: { name: string; email: string },
  project: { name: string },
  summary: string,
  link: string,
  siteUrl: string,
): MailMessage {
  return {
    to,
    replyTo: person.email,
    subject: `${project.name}: brief received`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: `${person.name} sent the brief of ${project.name}.`,
        title: 'The brief is in',
        intro: [`${person.name} sent the brief of ${project.name}.`],
        quote: { title: 'Goals', body: summary },
        button: { label: 'Read the brief', url: link },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
