import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';
import type { MeterKey } from './cloud-usage.js';

/** To the invited person: join a team on Codeqlick Cloud. */
export function cloudInviteEmail(input: {
  to: string;
  locale: ApiLocale;
  team: string;
  invitedBy: string;
  role: 'ADMIN' | 'MEMBER';
  url: string;
  siteUrl: string;
  /** The team requires two-step verification of every member (architecture 4.13). */
  requireTwoFactor?: boolean;
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
          ...(input.requireTwoFactor
            ? [
                es
                  ? 'Este equipo exige la verificación en dos pasos: actívala en tu cuenta de Codeqlick antes de usar el equipo.'
                  : 'This team requires two-step verification: set it up in your Codeqlick account before using the team.',
              ]
            : []),
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

/** To a team's owners, once a month: their sites' analytics reached the plan's events. */
export function cloudAnalyticsLimitEmail(input: {
  to: string;
  locale: ApiLocale;
  team: string;
  limit: number;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const limit = input.limit.toLocaleString(es ? 'es-ES' : 'en-GB');
  return {
    to: input.to,
    subject: es
      ? `La analítica de ${input.team} ha llegado al límite del mes`
      : `${input.team}'s analytics reached this month's limit`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: es ? `${limit} eventos este mes` : `${limit} events this month`,
        title: es ? 'Límite de analítica alcanzado' : 'Analytics limit reached',
        intro: [
          es
            ? `Las webs de ${input.team} han enviado ${limit} eventos de analítica este mes, el máximo de su plan. Hasta el día 1 las visitas nuevas no se cuentan; las webs siguen funcionando con normalidad.`
            : `${input.team}'s sites sent ${limit} analytics events this month, their plan's maximum. Until the 1st new visits aren't counted; the sites keep working as usual.`,
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

/** A build ended (architecture 4.13 "Build notifications"): to a channel's members. */
export function cloudBuildEmail(input: {
  to: string;
  locale: ApiLocale;
  /** The one-line summary (cloud-notify `summary`). */
  summary: string;
  failed: boolean;
  test: boolean;
  project: string;
  error: string | null;
  /** A production build kept as a preview (production locked after a rollback). */
  keptAsPreview?: boolean;
  buildUrl: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const title = input.test
    ? es
      ? 'Mensaje de prueba'
      : 'Test message'
    : input.failed
      ? es
        ? 'Una compilación ha fallado'
        : 'A build failed'
      : input.keptAsPreview
        ? es
          ? 'Vista previa lista'
          : 'Preview ready'
        : es
          ? 'Compilación publicada'
          : 'Build published';
  return {
    to: input.to,
    subject: `${input.test ? '🔔' : input.failed ? '❌' : '✅'} ${input.summary}`.slice(0, 180),
    ...renderEmail(
      {
        locale: input.locale,
        preheader: input.summary.slice(0, 120),
        title,
        intro: [input.summary],
        ...(input.error ? { quote: { title: 'Error', body: input.error } } : {}),
        button: { label: es ? 'Ver la compilación' : 'See the build', url: input.buildUrl },
        signoff: [],
      },
      input.siteUrl,
    ),
  };
}

/** A channel was switched off after ten failed deliveries: to the team's admins. */
export function cloudChannelOffEmail(input: {
  to: string;
  locale: ApiLocale;
  channel: string;
  project: string;
  error: string | null;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const intro = es
    ? `El aviso «${input.channel}» del proyecto ${input.project} ha fallado 10 veces seguidas y se ha desactivado. Revisa su dirección y vuelve a activarlo.`
    : `The notification "${input.channel}" of the project ${input.project} failed 10 times in a row and was switched off. Check its address and switch it back on.`;
  return {
    to: input.to,
    subject: es
      ? `Aviso desactivado: ${input.channel} (${input.project})`
      : `Notification switched off: ${input.channel} (${input.project})`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: intro.slice(0, 120),
        title: es ? 'Un aviso se ha desactivado' : 'A notification was switched off',
        intro: [intro],
        ...(input.error ? { quote: { title: 'Error', body: input.error } } : {}),
        button: { label: es ? 'Ver los avisos' : 'See the notifications', url: input.url },
        signoff: [],
      },
      input.siteUrl,
    ),
  };
}

/** A schedule was switched off after five failed scheduled builds: to the team's admins. */
export function cloudRebuildOffEmail(input: {
  to: string;
  locale: ApiLocale;
  project: string;
  error: string | null;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const intro = es
    ? `Las compilaciones programadas del proyecto ${input.project} han fallado 5 veces seguidas y la programación se ha desactivado. Revisa la última compilación y vuelve a activarla en la pestaña Git.`
    : `The scheduled builds of the project ${input.project} failed 5 times in a row and the schedule was switched off. Check the last build and switch it back on in the Git tab.`;
  return {
    to: input.to,
    subject: es
      ? `Compilaciones programadas desactivadas: ${input.project}`
      : `Scheduled builds switched off: ${input.project}`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: intro.slice(0, 120),
        title: es
          ? 'Las compilaciones programadas se han desactivado'
          : 'Scheduled builds were switched off',
        intro: [intro],
        ...(input.error ? { quote: { title: 'Error', body: input.error } } : {}),
        button: { label: es ? 'Ver la pestaña Git' : 'See the Git tab', url: input.url },
        signoff: [],
      },
      input.siteUrl,
    ),
  };
}

/** To a team's owners: their plan changed, or Stripe couldn't charge it (decision 46). */
export function cloudPlanEmail(input: {
  to: string;
  locale: ApiLocale;
  kind: 'pro' | 'free' | 'failed';
  team: string;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const text = {
    pro: es
      ? {
          subject: `${input.team} ya tiene el plan PRO`,
          title: 'Plan PRO activo',
          body: `Gracias. ${input.team} tiene desde ahora los límites del plan PRO. Puedes ver las facturas, cambiar la tarjeta o cancelar desde la página Plan de la consola.`,
        }
      : {
          subject: `${input.team} is now on PRO`,
          title: 'PRO plan active',
          body: `Thank you. ${input.team} has the PRO plan's limits from now on. See invoices, change the card or cancel from the console's Plan page.`,
        },
    free: es
      ? {
          subject: `${input.team} ha vuelto al plan gratuito`,
          title: 'Plan gratuito',
          body: `La suscripción PRO de ${input.team} ha terminado. No se ha borrado nada: lo que pase de los límites gratuitos sigue funcionando, pero no se puede añadir más.`,
        }
      : {
          subject: `${input.team} is back on the free plan`,
          title: 'Free plan',
          body: `${input.team}'s PRO subscription ended. Nothing was deleted: what is over the free limits keeps working, but nothing more can be added.`,
        },
    failed: es
      ? {
          subject: `No hemos podido cobrar el plan PRO de ${input.team}`,
          title: 'Pago no completado',
          body: `Stripe no ha podido cobrar la suscripción PRO de ${input.team} y lo volverá a intentar. Revisa la tarjeta desde la página Plan de la consola para no volver al plan gratuito.`,
        }
      : {
          subject: `We couldn't charge ${input.team}'s PRO plan`,
          title: 'Payment failed',
          body: `Stripe couldn't charge ${input.team}'s PRO subscription and will try again. Check the card from the console's Plan page so the team doesn't go back to the free plan.`,
        },
  }[input.kind];
  return {
    to: input.to,
    subject: text.subject,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: text.title,
        title: text.title,
        intro: [text.body],
        button: { label: es ? 'Abrir el plan' : 'Open the plan', url: input.url },
      },
      input.siteUrl,
    ),
  };
}

/** To a team's admins: a database went over its size and became read-only (decision 47). */
export function cloudDatabaseFullEmail(input: {
  to: string;
  locale: ApiLocale;
  project: string;
  database: string;
  maxBytes: number;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const size = `${Math.round(input.maxBytes / 1024 / 1024)} MB`;
  return {
    to: input.to,
    subject: es
      ? `La base de datos ${input.database} de ${input.project} está llena`
      : `${input.project}'s database ${input.database} is full`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: es ? 'Ahora es de solo lectura' : "It's read-only now",
        title: es ? 'Base de datos llena' : 'Database full',
        intro: [
          es
            ? `La base de datos ${input.database} del proyecto ${input.project} ocupa más de ${size}, el máximo de su plan, y ahora es de solo lectura. Borra datos (con DELETE y VACUUM) o pasa a PRO; vuelve a admitir escrituras en cuanto baja del límite. Si sigue creciendo hasta el 150 %, deja de aceptar conexiones.`
            : `Database ${input.database} of project ${input.project} is over ${size}, its plan's maximum, and is read-only now. Delete data (DELETE and VACUUM) or move to PRO; it takes writes again as soon as it is under the limit. If it keeps growing to 150 %, it stops taking connections.`,
        ],
        button: { label: es ? 'Abrir la consola' : 'Open the console', url: input.url },
      },
      input.siteUrl,
    ),
  };
}

/** What each measure of a usage alert is called, in a sentence about the team's use of it. */
const ALERT_WHAT: Record<MeterKey, { en: string; es: string }> = {
  builds: { en: 'its builds this month', es: 'sus builds este mes' },
  formSubmissions: {
    en: 'its form submissions this month',
    es: 'sus envíos de formularios este mes',
  },
  analyticsEvents: {
    en: 'its analytics events this month',
    es: 'sus eventos de analítica este mes',
  },
  storage: { en: 'its storage', es: 'su almacenamiento' },
  deploymentsPerHour: { en: 'its deployments per hour', es: 'sus despliegues por hora' },
};

const ALERT_RESETS: Record<MeterKey, { en: string; es: string }> = {
  builds: { en: 'on the 1st, Madrid time', es: 'el día 1, hora de Madrid' },
  formSubmissions: { en: 'on the 1st, Madrid time', es: 'el día 1, hora de Madrid' },
  analyticsEvents: { en: 'on the 1st, Madrid time', es: 'el día 1, hora de Madrid' },
  storage: { en: 'when you delete deployments', es: 'cuando borres despliegues' },
  deploymentsPerHour: { en: 'as the last hour passes', es: 'según pase la última hora' },
};

const ALERT_AT_FULL: Record<MeterKey, { en: string; es: string }> = {
  builds: {
    en: 'At 100 % new builds are refused.',
    es: 'Al 100 % los builds nuevos se rechazan.',
  },
  formSubmissions: {
    en: 'At 100 % form posts are refused with a 429.',
    es: 'Al 100 % los envíos de formularios se rechazan con un 429.',
  },
  analyticsEvents: {
    en: 'At 100 % new analytics events are dropped; the sites keep working.',
    es: 'Al 100 % los eventos de analítica nuevos se descartan; las webs siguen funcionando.',
  },
  storage: {
    en: 'At 100 % new deployments are refused.',
    es: 'Al 100 % los despliegues nuevos se rechazan.',
  },
  deploymentsPerHour: {
    en: 'At 100 % new deployments are refused until the hour passes.',
    es: 'Al 100 % los despliegues nuevos se rechazan hasta que pase la hora.',
  },
};

function alertAmount(key: MeterKey, value: number, es: boolean): string {
  const locale = es ? 'es-ES' : 'en-GB';
  if (key !== 'storage') return value.toLocaleString(locale);
  const mb = value / (1024 * 1024);
  return mb >= 1024
    ? `${(mb / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} GB`
    : `${mb.toLocaleString(locale, { maximumFractionDigits: 0 })} MB`;
}

/** To a team's owners: one of its plan's limits is at 80 % or more (decision 54). */
export function cloudUsageAlertEmail(input: {
  to: string;
  locale: ApiLocale;
  team: string;
  key: MeterKey;
  used: number;
  limit: number;
  percent: number;
  /** A FREE team on a server where PRO can be bought: say PRO has higher limits. */
  proHint: boolean;
  url: string;
  planUrl: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  const lang = es ? 'es' : 'en';
  const what = ALERT_WHAT[input.key][lang];
  const used = alertAmount(input.key, input.used, es);
  const limit = alertAmount(input.key, input.limit, es);
  const intro = [
    es
      ? `El equipo ${input.team} ha usado ${input.percent} % de ${what}: ${used} de ${limit}.`
      : `The team ${input.team} used ${input.percent} % of ${what}: ${used} of ${limit}.`,
    es
      ? `El contador se reinicia ${ALERT_RESETS[input.key].es}. ${ALERT_AT_FULL[input.key].es}`
      : `It resets ${ALERT_RESETS[input.key].en}. ${ALERT_AT_FULL[input.key].en}`,
  ];
  const outro = input.proHint
    ? [
        es
          ? `El plan PRO tiene límites más altos: ${input.planUrl}`
          : `The PRO plan has higher limits: ${input.planUrl}`,
      ]
    : undefined;
  return {
    to: input.to,
    subject: es
      ? `Tu equipo ${input.team} ha usado el ${input.percent} % de ${what}`
      : `Your team ${input.team} used ${input.percent} % of ${what}`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: es ? `${used} de ${limit}` : `${used} of ${limit}`,
        title: es ? 'Te acercas a un límite del plan' : 'You are close to a plan limit',
        intro,
        button: { label: es ? 'Ver el uso' : 'See the usage', url: input.url },
        ...(outro ? { outro } : {}),
      },
      input.siteUrl,
    ),
  };
}

/** To the target team's owners: a project was moved into their team (decision 58). */
export function cloudProjectTransferredEmail(input: {
  to: string;
  locale: ApiLocale;
  movedBy: string;
  project: string;
  from: string;
  team: string;
  address: string;
  gitDropped: boolean;
  url: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  return {
    to: input.to,
    subject: es
      ? `${input.movedBy} ha movido ${input.project} a ${input.team} en Codeqlick Cloud`
      : `${input.movedBy} moved ${input.project} to ${input.team} on Codeqlick Cloud`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: es
          ? `${input.project} ahora es de ${input.team}`
          : `${input.project} now belongs to ${input.team}`,
        title: es ? 'Un proyecto nuevo en tu equipo' : 'A new project in your team',
        intro: [
          es
            ? `${input.movedBy} ha movido el proyecto ${input.project} del equipo ${input.from} a ${input.team}. Su dirección sigue siendo ${input.address}.`
            : `${input.movedBy} moved the project ${input.project} from the team ${input.from} to ${input.team}. Its address is still ${input.address}.`,
          es
            ? 'Sus despliegues, dominios, formularios, variables, bases de datos, buckets y demás datos han venido con él, y desde ahora cuentan para los límites de tu equipo.'
            : "Its deployments, domains, forms, variables, databases, buckets and the rest of its data came with it, and count against your team's limits from now on.",
          ...(input.gitDropped
            ? [
                es
                  ? 'Ninguna instalación de GitHub de tu equipo ve su repositorio, así que se ha desconectado de Git: conéctalo de nuevo en la pestaña Git para seguir construyendo desde él.'
                  : "None of your team's GitHub installations can see its repository, so it was disconnected from Git: connect it again in the Git tab to keep building from it.",
              ]
            : []),
        ],
        button: { label: es ? 'Abrir el proyecto' : 'Open the project', url: input.url },
      },
      input.siteUrl,
    ),
  };
}
