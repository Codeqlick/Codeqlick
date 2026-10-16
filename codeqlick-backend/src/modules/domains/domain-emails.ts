import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

type Domain = { name: string; project: string; expiresAt: string; days: number };

const longDate = (day: string, locale: ApiLocale) =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));

/** To the team (English): a client's domain expires soon. */
export function domainTeamEmail(
  to: string,
  domain: Domain,
  adminUrl: string,
  siteUrl: string,
): MailMessage {
  const intro = `${domain.name} (${domain.project}) expires on ${longDate(domain.expiresAt, 'en')}, in ${domain.days} days. Make sure it renews: if it lapses, the site and its email stop working.`;
  return {
    to,
    subject: `[codeqlick] Domain expires in ${domain.days} days: ${domain.name}`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: intro.slice(0, 120),
        title: 'A domain expires soon',
        intro: [intro],
        button: { label: 'Open the project', url: adminUrl },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** To a person of the client account, in their language. */
export function domainClientEmail(
  person: { name: string; email: string; locale: ApiLocale },
  domain: Domain,
  portalUrl: string,
  siteUrl: string,
): MailMessage {
  const es = person.locale === 'es';
  const date = longDate(domain.expiresAt, person.locale);
  return {
    to: person.email,
    subject: es
      ? `Tu dominio ${domain.name} caduca en ${domain.days} días`
      : `Your domain ${domain.name} expires in ${domain.days} days`,
    ...renderEmail(
      {
        locale: person.locale,
        preheader: es ? `Caduca el ${date}.` : `It expires on ${date}.`,
        title: es ? 'Tu dominio caduca pronto' : 'Your domain expires soon',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: es
          ? [
              `El dominio ${domain.name} caduca el ${date}. Si no se renueva, tu web y el correo de ese dominio dejarán de funcionar.`,
              'Si lo renuevas tú con tu proveedor, no hace falta que hagas nada más. Si tienes dudas, responde a este correo.',
            ]
          : [
              `The domain ${domain.name} expires on ${date}. If it isn't renewed, your website and that domain's email stop working.`,
              'If you renew it yourself with your provider, there is nothing else to do. Any questions? Just reply to this email.',
            ],
        button: { label: es ? 'Ver el proyecto' : 'Open the project', url: portalUrl },
      },
      siteUrl,
    ),
  };
}

/** To a person of the client account: their own domain now serves their website. */
export function siteLiveEmail(
  person: { name: string; email: string; locale: ApiLocale },
  domain: string,
  siteUrl: string,
): MailMessage {
  const es = person.locale === 'es';
  return {
    to: person.email,
    subject: es ? `Tu web ya está en ${domain}` : `Your website is live at ${domain}`,
    ...renderEmail(
      {
        locale: person.locale,
        preheader: `https://${domain}`,
        title: es ? 'Tu web ya está en tu dominio' : 'Your website is on your domain',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: es
          ? [
              `Tu web ya se ve en https://${domain}, con conexión segura (HTTPS).`,
              'La dirección de prueba sigue funcionando, pero ya puedes compartir la nueva en tus redes, tarjetas y Google.',
            ]
          : [
              `Your website is now served at https://${domain}, over a secure connection (HTTPS).`,
              'The preview address still works, but you can now share the new one on your social networks, cards and Google.',
            ],
        button: { label: es ? 'Ver mi web' : 'Open my website', url: `https://${domain}` },
      },
      siteUrl,
    ),
  };
}
