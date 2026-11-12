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

/** To a form's recipients: a page of their project sent a form (architecture 4.13, Forms). */
export function cloudFormEmail(input: {
  to: string;
  locale: ApiLocale;
  project: string;
  form: string;
  subject: string | null;
  fields: Record<string, string>;
  replyTo: string | null;
  page: string | null;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const rows = Object.entries(input.fields).map(
    ([label, value]) => [label, value] as [string, string],
  );
  return {
    to: input.to,
    replyTo: input.replyTo ?? undefined,
    subject:
      input.subject ??
      (es
        ? `${input.form}: nuevo envío en ${input.project}`
        : `${input.form}: new submission on ${input.project}`),
    ...renderEmail(
      {
        locale: input.locale,
        preheader: Object.values(input.fields).join(' · ').slice(0, 120),
        title: es ? 'Nuevo envío de un formulario' : 'New form submission',
        intro: [
          es
            ? `Alguien ha enviado el formulario «${input.form}» de ${input.project}${input.page ? ` desde ${input.page}` : ''}.${input.replyTo ? ' Responde a este correo para contestarle.' : ''}`
            : `Someone sent the form "${input.form}" of ${input.project}${input.page ? ` from ${input.page}` : ''}.${input.replyTo ? ' Reply to this email to answer them.' : ''}`,
        ],
        details: rows,
        button: { label: es ? 'Ver los envíos' : 'See the submissions', url: input.url },
        note: es
          ? 'Codeqlick Cloud guarda los envíos 180 días. Lo recibes porque eres destinatario de este formulario.'
          : "Codeqlick Cloud keeps submissions 180 days. You get this because you're a recipient of this form.",
        signoff: [],
      },
      input.siteUrl,
    ),
  };
}

/** To a team's owners: its forms reached the plan's submissions this month. */
export function cloudFormsLimitEmail(input: {
  to: string;
  locale: ApiLocale;
  team: string;
  limit: number;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  return {
    to: input.to,
    subject: es
      ? `Los formularios de ${input.team} han llegado al límite del mes`
      : `${input.team}'s forms reached this month's limit`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: es ? `${input.limit} envíos este mes` : `${input.limit} submissions this month`,
        title: es ? 'Límite de envíos alcanzado' : 'Submission limit reached',
        intro: [
          es
            ? `Los formularios de ${input.team} han recibido ${input.limit} envíos este mes, el máximo del plan gratuito. Hasta el día 1 los nuevos envíos se rechazan.`
            : `${input.team}'s forms received ${input.limit} submissions this month, the free plan's maximum. Until the 1st, new submissions are refused.`,
        ],
        button: { label: es ? 'Abrir la consola' : 'Open the console', url: input.url },
      },
      input.siteUrl,
    ),
  };
}

/** To a monitor's chosen members: it went down, came back, or its certificate is about to expire. */
export function cloudMonitorEmail(input: {
  to: string;
  locale: ApiLocale;
  kind: 'down' | 'up' | 'cert';
  monitor: string;
  target: string;
  team: string;
  error: string | null;
  minutes?: number;
  certExpires?: string;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const texts = {
    down: {
      subject: es ? `Caído: ${input.monitor}` : `Down: ${input.monitor}`,
      title: es ? 'Un monitor está caído' : 'A monitor is down',
      intro: es
        ? `${input.monitor} (${input.target}), del equipo ${input.team}, no responde bien.`
        : `${input.monitor} (${input.target}), of the team ${input.team}, isn't answering properly.`,
    },
    up: {
      subject: es ? `Recuperado: ${input.monitor}` : `Back up: ${input.monitor}`,
      title: es ? 'Un monitor se ha recuperado' : 'A monitor is back up',
      intro: es
        ? `${input.monitor} (${input.target}) vuelve a funcionar${input.minutes ? ` después de ${input.minutes} min` : ''}.`
        : `${input.monitor} (${input.target}) is working again${input.minutes ? ` after ${input.minutes} min` : ''}.`,
    },
    cert: {
      subject: es
        ? `El certificado de ${input.monitor} caduca pronto`
        : `${input.monitor}'s certificate expires soon`,
      title: es ? 'Certificado a punto de caducar' : 'Certificate about to expire',
      intro: es
        ? `El certificado HTTPS de ${input.target} caduca el ${input.certExpires}. Renuévalo antes para que la web no deje de funcionar.`
        : `The HTTPS certificate of ${input.target} expires on ${input.certExpires}. Renew it before then so the site keeps working.`,
    },
  }[input.kind];
  return {
    to: input.to,
    subject: texts.subject,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: input.error ?? texts.intro.slice(0, 120),
        title: texts.title,
        intro: [texts.intro],
        ...(input.error && input.kind === 'down'
          ? { quote: { title: es ? 'Error' : 'Error', body: input.error } }
          : {}),
        button: { label: es ? 'Ver el monitor' : 'See the monitor', url: input.url },
        signoff: [],
      },
      input.siteUrl,
    ),
  };
}
