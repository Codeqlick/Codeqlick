import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** What the emails need of a finished check. */
export interface AuditForEmail {
  id: string;
  url: string;
  host: string;
  name: string | null;
  email: string;
  locale: ApiLocale;
  score: number | null;
  /** Each category's name and score, in the visitor's language. */
  categories: Array<{ name: string; score: number }>;
  /** The problems, worst first: title and advice in the visitor's language. */
  problems: Array<{ title: string; advice: string; status: 'warn' | 'fail' }>;
  /** Why it couldn't be checked (FAILED), in the visitor's language. */
  failure: string | null;
}

export function reportUrl(siteUrl: string, audit: Pick<AuditForEmail, 'id' | 'locale'>): string {
  return `${siteUrl}/${audit.locale}/website-check/${audit.id}`;
}

/** The report for the person who asked, in their language: score, main problems, the full report. */
export function auditReportEmail(audit: AuditForEmail, siteUrl: string): MailMessage {
  const es = audit.locale === 'es';
  const top = audit.problems.slice(0, 5);
  const greeting = audit.name
    ? es
      ? `Hola ${audit.name}:`
      : `Hi ${audit.name},`
    : es
      ? 'Hola:'
      : 'Hi,';
  return {
    to: audit.email,
    subject: es
      ? `Revisión de ${audit.host}: ${audit.score}/100`
      : `Check of ${audit.host}: ${audit.score}/100`,
    ...renderEmail(
      {
        locale: audit.locale,
        preheader: es
          ? `Tu web saca ${audit.score}/100. Te contamos qué mejorar.`
          : `Your website scores ${audit.score}/100. Here's what to improve.`,
        title: es ? `Tu web saca ${audit.score}/100` : `Your website scores ${audit.score}/100`,
        greeting,
        intro: [
          es
            ? `Hemos revisado ${audit.url}: su rapidez, cómo se ve en el móvil, si está lista para Google y su seguridad.`
            : `We checked ${audit.url}: its speed, how it looks on phones, whether it's ready for Google and its security.`,
          top.length
            ? es
              ? 'Esto es lo más importante que mejoraríamos:'
              : 'These are the most important things we would improve:'
            : es
              ? 'No hemos encontrado problemas importantes. ¡Buen trabajo!'
              : 'We found no important problems. Well done!',
        ],
        details: audit.categories.map((category) => [category.name, `${category.score}/100`]),
        quote: top.length
          ? top.map((problem) => ({ title: problem.title, body: problem.advice }))
          : undefined,
        button: {
          label: es ? 'Ver el informe completo' : 'See the full report',
          url: reportUrl(siteUrl, audit),
        },
        outro: [
          es
            ? '¿Quieres que lo arreglemos? Responde a este correo y te decimos cómo y cuánto costaría, sin compromiso. Y si tu web se ha quedado anticuada, te hacemos una nueva con dominio, correo y alojamiento incluidos.'
            : "Want us to fix it? Reply to this email and we'll tell you how and what it would cost, no strings attached. And if your website is out of date, we can build you a new one with domain, email and hosting included.",
        ],
      },
      siteUrl,
    ),
  };
}

/** The site couldn't be opened: tell them why, in their language. */
export function auditFailedEmail(audit: AuditForEmail, siteUrl: string): MailMessage {
  const es = audit.locale === 'es';
  return {
    to: audit.email,
    subject: es ? `No hemos podido revisar ${audit.host}` : `We couldn't check ${audit.host}`,
    ...renderEmail(
      {
        locale: audit.locale,
        preheader: audit.failure ?? '',
        title: es ? 'No hemos podido abrir tu web' : "We couldn't open your website",
        greeting: audit.name
          ? es
            ? `Hola ${audit.name}:`
            : `Hi ${audit.name},`
          : es
            ? 'Hola:'
            : 'Hi,',
        intro: [
          es
            ? `Intentamos revisar ${audit.url}, pero no fue posible: ${audit.failure}`
            : `We tried to check ${audit.url}, but couldn't: ${audit.failure}`,
          es
            ? 'Puedes volver a intentarlo con la dirección correcta, o responder a este correo y lo miramos nosotros.'
            : 'You can try again with the right address, or reply to this email and we will look into it.',
        ],
        button: {
          label: es ? 'Probar otra vez' : 'Try again',
          url: `${siteUrl}/${audit.locale}/website-check`,
        },
      },
      siteUrl,
    ),
  };
}

/** The team inbox's note of a check (English), with the report and the lead. */
export function auditTeamEmail(
  to: string,
  audit: AuditForEmail,
  leadId: string | null,
  siteUrl: string,
): MailMessage {
  return {
    to,
    replyTo: audit.email,
    subject: audit.failure
      ? `Website check failed: ${audit.host}`
      : `Website check: ${audit.host} (${audit.score}/100)`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: audit.failure ?? `${audit.problems.length} things to improve`,
        title: `Website check: ${audit.host}`,
        intro: [
          audit.failure
            ? `Someone asked for a free check of ${audit.url}, but it couldn't be opened (${audit.failure}).`
            : `Someone asked for a free check of ${audit.url}. It scored ${audit.score}/100 and they were emailed the report. Reply to this email to write to them.`,
        ],
        details: [
          ['Name', audit.name ?? '-'],
          ['Email', audit.email],
          ['Website', audit.url],
          ['Locale', audit.locale],
          ...audit.categories.map(
            (category) => [category.name, `${category.score}/100`] as [string, string],
          ),
          ['Problems', String(audit.problems.length)],
        ],
        button: leadId
          ? { label: 'Open the lead', url: `${siteUrl}/es/admin/leads/${leadId}` }
          : { label: 'Open the report', url: reportUrl(siteUrl, audit) },
        outro: leadId ? [`Report: ${reportUrl(siteUrl, audit)}`] : undefined,
        signoff: [],
      },
      siteUrl,
    ),
  };
}
