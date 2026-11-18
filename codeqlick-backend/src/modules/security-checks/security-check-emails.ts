import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';
import { PASSIVE_STATEMENT } from './security-check-texts.js';

/** What the emails need of a finished check. */
export interface CheckForEmail {
  id: string;
  domain: string;
  name: string | null;
  email: string;
  locale: ApiLocale;
  score: number | null;
  grade: string | null;
  /** The main findings, worst first, in the visitor's language. */
  problems: Array<{ title: string; advice: string; status: 'warn' | 'fail' }>;
  /** Why it couldn't be checked (FAILED), in the visitor's language. */
  failure: string | null;
}

export function reportUrl(siteUrl: string, check: Pick<CheckForEmail, 'id' | 'locale'>): string {
  return `${siteUrl}/${check.locale}/security-check/${check.id}`;
}

/** The visitor's name for the greeting: letters and spaces only, at most 40 characters. */
export function greetingName(name: string | null): string {
  return (name ?? '')
    .replace(/[^\p{L} ]/gu, ' ')
    .replace(/ +/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
}

const greetingOf = (check: CheckForEmail): string => {
  const name = greetingName(check.name);
  if (check.locale === 'es') return name ? `Hola ${name}:` : 'Hola:';
  return name ? `Hi ${name},` : 'Hi,';
};

/** The report for the person who asked, in their language: grade, main findings, the full report. */
export function securityReportEmail(check: CheckForEmail, siteUrl: string): MailMessage {
  const es = check.locale === 'es';
  const top = check.problems.slice(0, 5);
  const fails = check.problems.filter((problem) => problem.status === 'fail').length;
  return {
    to: check.email,
    subject: es
      ? `Revisión de seguridad de ${check.domain}: nota ${check.grade}`
      : `Security check of ${check.domain}: grade ${check.grade}`,
    ...renderEmail(
      {
        locale: check.locale,
        preheader: es
          ? `${check.domain} saca un ${check.grade} (${check.score}/100). Te contamos qué mejorar.`
          : `${check.domain} gets a ${check.grade} (${check.score}/100). Here's what to improve.`,
        title: es
          ? `${check.domain}: nota ${check.grade}`
          : `${check.domain}: grade ${check.grade}`,
        greeting: greetingOf(check),
        intro: [
          es
            ? `Hemos hecho la revisión de seguridad gratuita de ${check.domain}: HTTPS, cabeceras, la página, DNS y correo. Saca ${check.score}/100, nota ${check.grade}.`
            : `We ran the free security check of ${check.domain}: HTTPS, headers, the page, DNS and email. It scores ${check.score}/100, grade ${check.grade}.`,
          top.length
            ? es
              ? `Esto es lo más importante que mejoraríamos${fails ? ` (${fails} urgente${fails === 1 ? '' : 's'})` : ''}:`
              : `These are the most important things we would improve${fails ? ` (${fails} urgent)` : ''}:`
            : es
              ? 'No hemos encontrado problemas en estas comprobaciones pasivas.'
              : 'We found no issues in these passive checks.',
        ],
        quote: top.length
          ? top.map((problem) => ({ title: problem.title, body: problem.advice }))
          : undefined,
        button: {
          label: es ? 'Ver el informe completo' : 'See the full report',
          url: reportUrl(siteUrl, check),
        },
        outro: [
          es
            ? '¿Quieres que lo arreglemos? Responde a este correo y te decimos cómo y cuánto costaría, sin compromiso.'
            : "Want us to fix it? Reply to this email and we'll tell you how and what it would cost, no strings attached.",
          PASSIVE_STATEMENT[check.locale],
        ],
      },
      siteUrl,
    ),
  };
}

/** The domain couldn't be checked: tell them why, in their language. */
export function securityFailedEmail(check: CheckForEmail, siteUrl: string): MailMessage {
  const es = check.locale === 'es';
  return {
    to: check.email,
    subject: es ? `No hemos podido revisar ${check.domain}` : `We couldn't check ${check.domain}`,
    ...renderEmail(
      {
        locale: check.locale,
        preheader: check.failure ?? '',
        title: es ? 'No hemos podido hacer la revisión' : "We couldn't run the check",
        greeting: greetingOf(check),
        intro: [
          es
            ? `Intentamos revisar ${check.domain}, pero no fue posible: ${check.failure}`
            : `We tried to check ${check.domain}, but couldn't: ${check.failure}`,
          es
            ? 'Puedes volver a intentarlo con el dominio correcto, o responder a este correo y lo miramos nosotros.'
            : 'You can try again with the right domain, or reply to this email and we will look into it.',
        ],
        button: {
          label: es ? 'Probar otra vez' : 'Try again',
          url: `${siteUrl}/${check.locale}/security-check`,
        },
      },
      siteUrl,
    ),
  };
}

/** The team inbox's note of a check (English), with the report and the lead. */
export function securityTeamEmail(
  to: string,
  check: CheckForEmail,
  leadId: string | null,
  siteUrl: string,
): MailMessage {
  return {
    to,
    replyTo: check.email,
    subject: check.failure
      ? `Security check failed: ${check.domain}`
      : `Security check: ${check.domain} (${check.grade}, ${check.score}/100)`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: check.failure ?? `${check.problems.length} things to improve`,
        title: `Security check: ${check.domain}`,
        intro: [
          check.failure
            ? `Someone asked for a free security check of ${check.domain}, but it couldn't be run (${check.failure}).`
            : `Someone asked for a free security check of ${check.domain}. It got ${check.grade} (${check.score}/100) and they were emailed the report. Reply to this email to write to them.`,
        ],
        details: [
          ['Name', check.name ?? '-'],
          ['Email', check.email],
          ['Domain', check.domain],
          ['Locale', check.locale],
          ['Grade', check.grade ?? '-'],
          ['Findings', String(check.problems.length)],
        ],
        button: leadId
          ? { label: 'Open the lead', url: `${siteUrl}/es/admin/leads/${leadId}` }
          : { label: 'Open the report', url: reportUrl(siteUrl, check) },
        outro: leadId ? [`Report: ${reportUrl(siteUrl, check)}`] : undefined,
        signoff: [],
      },
      siteUrl,
    ),
  };
}
