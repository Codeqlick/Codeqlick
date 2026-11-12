import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** To the invited person: join a team on Codeqlick Cloud. */
export function cloudInviteEmail(input: {
  to: string;
  locale: ApiLocale;
  team: string;
  invitedBy: string;
  role: 'ADMIN' | 'MEMBER';
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const role = es
    ? input.role === 'ADMIN'
      ? 'administrador'
      : 'miembro'
    : input.role === 'ADMIN'
      ? 'admin'
      : 'member';
  return {
    to: input.to,
    subject: es
      ? `${input.invitedBy} te invita a ${input.team} en Codeqlick Cloud`
      : `${input.invitedBy} invited you to ${input.team} on Codeqlick Cloud`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: es ? `Únete al equipo ${input.team}` : `Join the ${input.team} team`,
        title: es ? 'Te han invitado a un equipo' : "You've been invited to a team",
        intro: [
          es
            ? `${input.invitedBy} te invita a unirte a ${input.team} en Codeqlick Cloud como ${role}. Inicia sesión (o crea tu cuenta) con este email para aceptar.`
            : `${input.invitedBy} invited you to join ${input.team} on Codeqlick Cloud as a ${role}. Sign in (or create your account) with this email to accept.`,
        ],
        button: { label: es ? 'Ver la invitación' : 'View the invitation', url: input.url },
        note: es
          ? 'La invitación caduca en 7 días. Si no esperabas este correo, ignóralo.'
          : "The invitation expires in 7 days. If you weren't expecting it, ignore this email.",
      },
      input.siteUrl,
    ),
  };
}

/** To a team's owners: one of their projects was suspended. */
export function cloudSuspendedEmail(input: {
  to: string;
  locale: ApiLocale;
  project: string;
  url: string;
  reason: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  return {
    to: input.to,
    replyTo: 'hello@codeqlick.com',
    subject: es
      ? `Hemos suspendido ${input.project} en Codeqlick Cloud`
      : `We suspended ${input.project} on Codeqlick Cloud`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: input.reason.slice(0, 120),
        title: es ? 'Proyecto suspendido' : 'Project suspended',
        intro: [
          es
            ? `Hemos suspendido el proyecto ${input.project} (${input.url}) porque incumple las condiciones de Codeqlick Cloud. Sus direcciones muestran un aviso y no admite despliegues.`
            : `We suspended the project ${input.project} (${input.url}) because it breaks the Codeqlick Cloud terms. Its addresses show a notice and it takes no deployments.`,
        ],
        quote: { title: es ? 'Motivo' : 'Reason', body: input.reason },
        outro: [
          es
            ? 'Si crees que es un error, responde a este correo y lo revisaremos.'
            : 'If you think this is a mistake, reply to this email and we will review it.',
        ],
      },
      input.siteUrl,
    ),
  };
}

/** To the team inbox: someone reported a page hosted on Cloud. */
export function cloudReportEmail(input: {
  to: string;
  url: string;
  reason: string;
  details: string;
  email: string;
  project: string | null;
  adminUrl: string;
  siteUrl: string;
}): MailMessage {
  return {
    to: input.to,
    replyTo: input.email,
    subject: `Cloud report (${input.reason}): ${input.url}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: input.details.slice(0, 120),
        title: 'A page on Codeqlick Cloud was reported',
        intro: ['Review it and suspend the project if it breaks the Cloud terms.'],
        details: [
          ['Address', input.url],
          ['Project', input.project ?? 'not matched'],
          ['Reason', input.reason],
          ['Reported by', input.email],
        ],
        quote: { body: input.details },
        button: { label: 'Open Admin → Cloud', url: input.adminUrl },
        signoff: [],
      },
      input.siteUrl,
    ),
  };
}
