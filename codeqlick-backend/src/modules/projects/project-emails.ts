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
  update: {
    title: string;
    body: string;
    approvalRequested?: boolean;
    release?: { version: string; environment: 'STAGING' | 'PRODUCTION'; url: string | null };
  },
  link: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  const approval = update.approvalRequested === true;
  const release = update.release;
  const where = release
    ? release.environment === 'PRODUCTION'
      ? es
        ? 'en producción'
        : 'live'
      : es
        ? 'en el entorno de pruebas'
        : 'on the preview site'
    : '';
  return {
    to: client.email,
    subject: approval
      ? es
        ? `${project.name}: ${update.title} (pendiente de tu aprobación)`
        : `${project.name}: ${update.title} (waiting for your approval)`
      : `${project.name}: ${update.title}`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Novedad en ${project.name}: ${update.title}`
          : `Update on ${project.name}: ${update.title}`,
        title: release
          ? es
            ? `Nueva versión de ${project.name}`
            : `New version of ${project.name}`
          : es
            ? `Novedad en ${project.name}`
            : `Update on ${project.name}`,
        greeting: es ? `Hola ${client.name}:` : `Hi ${client.name},`,
        intro: [
          release
            ? es
              ? `Hemos publicado la versión ${release.version} ${where}. Esto es lo que cambia:`
              : `We've released version ${release.version} ${where}. Here's what changed:`
            : es
              ? 'Hemos publicado una novedad en tu proyecto:'
              : "We've posted an update on your project:",
        ],
        details: release?.url ? [[es ? 'Pruébala aquí' : 'Try it here', release.url]] : undefined,
        quote: { title: update.title, body: excerpt(update.body) },
        button: approval
          ? { label: es ? 'Revisar y aprobar' : 'Review and approve', url: link }
          : { label: es ? 'Ver el proyecto' : 'View the project', url: link },
        outro: approval
          ? [
              es
                ? 'Te pedimos tu aprobación para seguir adelante. Puedes aprobarla o dejarnos un comentario desde tu área de cliente.'
                : 'We need your approval to move on. You can approve it or leave us a comment from your client area.',
            ]
          : undefined,
      },
      siteUrl,
    ),
  };
}

/** Tells the client the team answered on one of their project's updates, in their language. */
export function teamCommentEmail(
  client: { name: string; email: string },
  project: { name: string },
  update: { title: string },
  comment: { body: string; authorName: string },
  link: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: client.email,
    subject: es ? `${project.name}: nuevo comentario` : `${project.name}: new comment`,
    ...renderEmail(
      {
        locale,
        preheader: excerpt(comment.body).slice(0, 120),
        title: es ? `Nuevo comentario en ${project.name}` : `New comment on ${project.name}`,
        greeting: es ? `Hola ${client.name}:` : `Hi ${client.name},`,
        intro: [
          es
            ? `${comment.authorName} ha comentado en «${update.title}»:`
            : `${comment.authorName} commented on "${update.title}":`,
        ],
        quote: { body: excerpt(comment.body) },
        button: { label: es ? 'Responder' : 'Reply', url: link },
      },
      siteUrl,
    ),
  };
}

/** Tells the team (in English, like lead notifications) that a client commented or approved. */
export function clientActivityEmail(
  to: string,
  client: { name: string; email: string },
  project: { name: string },
  update: { title: string },
  event: { kind: 'comment'; body: string } | { kind: 'approval' },
  link: string,
  siteUrl: string,
): MailMessage {
  const approval = event.kind === 'approval';
  return {
    to,
    replyTo: client.email,
    subject: approval
      ? `${project.name}: ${client.name} approved "${update.title}"`
      : `${project.name}: ${client.name} commented on "${update.title}"`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: approval ? `Approved: ${update.title}` : excerpt(event.body).slice(0, 120),
        title: approval ? `${client.name} approved an update` : `${client.name} left a comment`,
        intro: [
          approval
            ? `${client.name} approved "${update.title}" on ${project.name}.`
            : `${client.name} commented on "${update.title}" on ${project.name}. Answer from the admin panel so the reply stays on the project.`,
        ],
        quote: approval ? undefined : { body: excerpt(event.body) },
        button: { label: 'Open in the admin panel', url: link },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** Tells the team (in English) that a draft update is waiting for review. */
export function draftReadyEmail(
  to: string,
  project: { name: string },
  draft: { title: string; body: string; version: string | null },
  link: string,
  siteUrl: string,
): MailMessage {
  const title = draft.version ? `${draft.version} · ${draft.title}` : draft.title;
  return {
    to,
    subject: `${project.name}: draft ready to review — ${title}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: excerpt(draft.body).slice(0, 120),
        title: 'A draft update is ready',
        intro: [
          `A draft update for ${project.name} came in. Nothing has been sent to the client: review it, edit it if needed and publish it from the project page.`,
        ],
        quote: { title, body: excerpt(draft.body) },
        button: { label: 'Review the draft', url: link },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
