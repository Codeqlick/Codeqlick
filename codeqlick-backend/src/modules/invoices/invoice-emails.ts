import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** `1.234,56 €` or `€1,234.56`. */
export function formatMoney(cents: number, currency: string, locale: ApiLocale): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** `14 de noviembre de 2026` or `14 November 2026`, for a `yyyy-mm-dd` day. */
function formatDay(day: string, locale: ApiLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** To each person of the client account when the team uploads an invoice. */
export function invoiceAddedEmail(
  person: { name: string; email: string },
  project: { name: string },
  invoice: { number: string; amountCents: number; currency: string; dueOn: string | null },
  link: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  const amount = formatMoney(invoice.amountCents, invoice.currency, locale);
  const due = invoice.dueOn ? formatDay(invoice.dueOn, locale) : null;
  return {
    to: person.email,
    subject: es
      ? `Factura ${invoice.number} de ${project.name} — Codeqlick`
      : `Invoice ${invoice.number} for ${project.name} — Codeqlick`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Tienes una nueva factura de ${amount} en tu área de cliente.`
          : `There is a new invoice of ${amount} in your client area.`,
        title: es ? 'Nueva factura' : 'New invoice',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: [
          es
            ? `Hemos emitido la factura ${invoice.number} de ${project.name}, por ${amount} (IVA incluido).`
            : `We have issued invoice ${invoice.number} for ${project.name}, of ${amount} (VAT included).`,
          ...(due
            ? [
                es
                  ? `Vence el ${due}. En la factura tienes los datos para el pago.`
                  : `It is due on ${due}. The invoice has the payment details.`,
              ]
            : []),
        ],
        button: { label: es ? 'Ver y descargar la factura' : 'View and download it', url: link },
        note: es
          ? 'Todas tus facturas están en la sección «Facturas» de tu área de cliente. ¿Alguna duda? Responde a este correo.'
          : 'All your invoices are in the "Invoices" section of your client area. Any question? Just reply to this email.',
      },
      siteUrl,
    ),
  };
}
