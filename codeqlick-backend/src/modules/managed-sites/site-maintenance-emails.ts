/** Emails of the maintenance plan (architecture 8.2, decision 110): plain text + branded HTML. */
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

export type MaintenanceEmailKind = 'active' | 'failed' | 'ended';

const day = (date: Date, locale: ApiLocale) =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(date);

/** To a person of the client account, in their language. */
export function maintenanceClientEmail(
  person: { name: string; email: string; locale: ApiLocale },
  kind: MaintenanceEmailKind,
  project: string,
  urls: { card: string; site: string },
  periodEnd: Date | null,
): MailMessage {
  const es = person.locale === 'es';
  const greeting = es ? `Hola ${person.name}:` : `Hi ${person.name},`;
  const content = {
    active: {
      subject: es
        ? `Tu plan de mantenimiento está activo: ${project}`
        : `Your maintenance plan is active: ${project}`,
      title: es ? 'Plan de mantenimiento activo' : 'Maintenance plan active',
      intro: es
        ? [
            `Gracias. El plan de mantenimiento de ${project} ya está activo.`,
            'Nos ocupamos del alojamiento y el certificado, de las actualizaciones y la seguridad de la web y de vigilar la renovación de tu dominio. Cada mes puedes pedirnos hasta 3 cambios pequeños desde tu área de cliente, y tus solicitudes tienen prioridad.',
          ]
        : [
            `Thank you. The maintenance plan of ${project} is now active.`,
            'We look after the hosting and the certificate, the website’s updates and security, and your domain’s renewal. Each month you can ask us for up to 3 small changes from your client area, and your requests come first.',
          ],
      button: es ? 'Ver mi plan' : 'See my plan',
      note: es
        ? `Stripe te envía por email la factura de cada mes${periodEnd ? `; la próxima renovación es el ${day(periodEnd, 'es')}` : ''}. Puedes cancelarlo cuando quieras desde la misma página.`
        : `Stripe emails you each month’s invoice${periodEnd ? `; the next renewal is on ${day(periodEnd, 'en')}` : ''}. You can cancel it whenever you like from the same page.`,
    },
    failed: {
      subject: es
        ? `No hemos podido cobrar el plan de mantenimiento: ${project}`
        : `We couldn't charge the maintenance plan: ${project}`,
      title: es ? 'El cobro del plan ha fallado' : 'The plan’s payment failed',
      intro: es
        ? [
            `Stripe no ha podido cobrar este mes el plan de mantenimiento de ${project}. Lo volverá a intentar en los próximos días y, mientras tanto, el plan sigue activo.`,
            'Revisa o cambia tu tarjeta desde "Gestionar el plan" para que no se cancele.',
          ]
        : [
            `Stripe couldn't charge this month’s maintenance plan of ${project}. It will try again over the next days and, meanwhile, the plan stays on.`,
            'Check or change your card from "Manage the plan" so it isn’t cancelled.',
          ],
      button: es ? 'Revisar el pago' : 'Check the payment',
      note: es
        ? 'Si ya lo has resuelto, ignora este email.'
        : 'If you have already sorted it out, ignore this email.',
    },
    ended: {
      subject: es
        ? `Tu plan de mantenimiento ha terminado: ${project}`
        : `Your maintenance plan has ended: ${project}`,
      title: es ? 'Plan de mantenimiento terminado' : 'Maintenance plan ended',
      intro: es
        ? [
            `El plan de mantenimiento de ${project} ha terminado y ya no se cobrará.`,
            'Tu web sigue en línea como siempre y puedes seguir cambiándola tú desde tu área de cliente. Los cambios que nos pidas se presupuestan aparte. Puedes volver a contratar el plan cuando quieras.',
          ]
        : [
            `The maintenance plan of ${project} has ended and won't be charged again.`,
            'Your website stays online as always and you can keep changing it yourself from your client area. Changes you ask us for are quoted apart. You can take the plan again whenever you like.',
          ],
      button: es ? 'Ver mi web' : 'See my website',
      note: es
        ? 'Si no esperabas este email, respóndenos y lo miramos.'
        : "If you didn't expect this email, reply and we'll look into it.",
    },
  }[kind];
  return {
    to: person.email,
    subject: content.subject,
    ...renderEmail(
      {
        locale: person.locale,
        preheader: content.intro[0]!,
        title: content.title,
        greeting,
        intro: content.intro,
        button: { label: content.button, url: urls.card },
        note: content.note,
      },
      urls.site,
    ),
  };
}

/** To the team inbox (English, like the other team notifications). */
export function maintenanceTeamEmail(
  to: string,
  kind: MaintenanceEmailKind,
  project: { name: string; client: string },
  urls: { admin: string; site: string },
  details: { status: string; periodEnd: Date | null },
): MailMessage {
  const titles = {
    active: 'A maintenance plan is active',
    failed: 'A maintenance plan’s payment failed',
    ended: 'A maintenance plan ended',
  } as const;
  const intros = {
    active: `${project.client} took the maintenance plan of ${project.name}.`,
    failed: `Stripe couldn't charge the maintenance plan of ${project.name}; it retries and the plan stays on meanwhile.`,
    ended: `The maintenance plan of ${project.name} ended (cancelled or unpaid).`,
  } as const;
  return {
    to,
    subject: `[codeqlick] ${titles[kind]}: ${project.name}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: intros[kind],
        title: titles[kind],
        intro: [intros[kind]],
        details: [
          ['Project', project.name],
          ['Client', project.client],
          ['Stripe status', details.status],
          ['Period end', details.periodEnd ? day(details.periodEnd, 'en') : '—'],
        ],
        button: { label: 'Open the project', url: urls.admin },
        signoff: [],
      },
      urls.site,
    ),
  };
}
