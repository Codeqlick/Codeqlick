import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** To the owner, in their language: the team suspended their menu, and why. */
export function menuSuspendedEmail(input: {
  to: string;
  locale: ApiLocale;
  businessName: string;
  /** The public link, `menu.codeqlick.com/<slug>`. */
  link: string;
  /** The app's home, where the owner sees the banner. */
  appUrl: string;
  reason: string;
  siteUrl: string;
}): MailMessage {
  const es = input.locale === 'es';
  return {
    to: input.to,
    replyTo: 'hello@codeqlick.com',
    subject: es
      ? `Hemos suspendido tu carta ${input.businessName}`
      : `We suspended your menu ${input.businessName}`,
    ...renderEmail(
      {
        locale: input.locale,
        preheader: input.reason.slice(0, 120),
        title: es ? 'Carta suspendida' : 'Menu suspended',
        intro: [
          es
            ? `Hemos suspendido la carta de ${input.businessName} (${input.link}). Su página muestra un aviso de que no está disponible y no puedes activarla ni cambiar su enlace mientras tanto. Puedes seguir editándola.`
            : `We suspended the menu of ${input.businessName} (${input.link}). Its page shows that it is not available, and you cannot turn it on or change its link meanwhile. You can keep editing it.`,
        ],
        quote: { title: es ? 'Motivo' : 'Reason', body: input.reason },
        button: { label: es ? 'Abrir Menu' : 'Open Menu', url: input.appUrl },
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

/** To the team inbox: someone reported a menu. */
export function menuReportEmail(input: {
  to: string;
  slug: string;
  businessName: string;
  reason: string;
  details: string;
  email: string | null;
  adminUrl: string;
  siteUrl: string;
}): MailMessage {
  return {
    to: input.to,
    replyTo: input.email ?? undefined,
    subject: `Menu report (${input.reason}): ${input.slug}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: input.details.slice(0, 120),
        title: 'A menu was reported',
        intro: ['Review it and suspend the menu if it breaks the terms.'],
        details: [
          ['Link', input.slug],
          ['Business', input.businessName],
          ['Reason', input.reason],
          ['Reported by', input.email ?? 'not given'],
        ],
        quote: { body: input.details },
        button: { label: 'Open Admin → Menus', url: input.adminUrl },
        signoff: [],
      },
      input.siteUrl,
    ),
  };
}
