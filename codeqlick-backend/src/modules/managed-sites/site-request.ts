import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';
import { sitePresetSchema, type SiteContent } from './managed-sites.schemas.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value));

/** The public basic-website request (architecture 8.2). */
export const siteRequestSchema = z
  .object({
    preset: sitePresetSchema,
    business: z
      .object({
        name: z.string().trim().min(1).max(80),
        /** What it is: "Peluquería", "Taller de bicis"… */
        kind: z.string().trim().min(1).max(80),
        city: z.string().trim().min(1).max(80),
        address: optionalText(160),
        phone: optionalText(30),
        whatsapp: optionalText(30),
        email: z
          .union([z.literal(''), z.email().max(254)])
          .optional()
          .transform((value) => value || undefined),
        /** One line per row: "Lunes a viernes: 9:00–20:00". */
        hours: optionalText(1000),
        /** One line per service: "Corte — 15 €". */
        services: optionalText(3000),
        about: optionalText(3000),
        /** What they want on their website, in their words (any kind of website). */
        wishes: optionalText(3000),
      })
      .strict(),
    /** The domain they want (`owned: false`) or already have (architecture 8.2). */
    domain: z
      .object({
        name: z
          .string()
          .trim()
          .toLowerCase()
          .regex(
            /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
            'A domain like peluqueria.es',
          ),
        owned: z.boolean(),
      })
      .strict()
      .optional(),
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    locale: localeSchema,
    /** Honeypot: humans never see this field, bots fill it in. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type SiteRequestInput = z.infer<typeof siteRequestSchema>;
/** What a lead keeps: the request without the contact person and the honeypot. */
export type SiteRequest = Pick<SiteRequestInput, 'preset' | 'business' | 'domain'>;

/** A lead's request as the team edits it (`PUT /admin/leads/:id/request`). */
export const storedRequestSchema = siteRequestSchema
  .pick({ preset: true, business: true, domain: true })
  .strict();

/** A prospect's preview (`POST /admin/previews`): the request and, optionally, the person. */
export const prospectSchema = storedRequestSchema
  .extend({
    name: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || undefined),
    email: z
      .union([z.literal(''), z.email().max(254)])
      .optional()
      .transform((value) => value || undefined),
    locale: localeSchema.default('es'),
  })
  .strict();
export type ProspectInput = z.infer<typeof prospectSchema>;

const PRESET_NAMES: Record<string, string> = {
  peluqueria: 'Peluquería (Alba Estudio)',
  restaurante: 'Restaurante (Casa Lola)',
  fisioterapia: 'Fisioterapia (Fisio Retiro)',
  portfolio: 'Portfolio (Nora Vidal)',
  despacho: 'Despacho profesional (Ortega & Sanz)',
  comercio: 'Tienda (Flores Abril)',
  reformas: 'Reformas y oficios (Reformas Duero)',
  general: 'Otro tipo de web (Brezo)',
};

/** The lead's message: the request in plain text, as the team reads it in the email and panel. */
export function requestSummary(request: SiteRequest): string {
  const b = request.business;
  const lines = [
    `Basic website request — style: ${PRESET_NAMES[request.preset] ?? request.preset}`,
    '',
    `Business: ${b.name} (${b.kind}, ${b.city})`,
    b.address ? `Address: ${b.address}` : null,
    b.phone ? `Phone: ${b.phone}` : null,
    b.whatsapp ? `WhatsApp: ${b.whatsapp}` : null,
    b.email ? `Email: ${b.email}` : null,
    b.hours ? `\nOpening hours:\n${b.hours}` : null,
    b.services ? `\nServices:\n${b.services}` : null,
    b.about ? `\nAbout:\n${b.about}` : null,
    b.wishes ? `\nWhat they want on the website:\n${b.wishes}` : null,
    request.domain
      ? `\nDomain: ${request.domain.name} (${request.domain.owned ? 'they already have it' : 'they want to register it'})`
      : null,
  ];
  return lines.filter((line) => line !== null).join('\n');
}

const lines = (text: string | undefined) =>
  (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** "Lunes a viernes: 9:00–20:00" → days and hours; without a separator, the line is the days. */
function hoursRow(line: string): { days: string; hours: string } {
  const match = /^(.+?)\s*(?::\s|—|–|\s-\s)\s*(.+)$/.exec(line);
  return match
    ? { days: match[1]!.slice(0, 60), hours: match[2]!.slice(0, 60) }
    : { days: line.slice(0, 60), hours: '—' };
}

/** "Corte de pelo — 15 €" → name and price; the price is the last part with a digit. */
function serviceRow(line: string): { name: string; price?: string } {
  const match = /^(.+?)\s*(?:—|–|\s-\s|:\s)\s*([^—–:]*\d[^—–:]*)$/.exec(line);
  return match
    ? { name: match[1]!.slice(0, 80), price: match[2]!.trim().slice(0, 30) }
    : { name: line.slice(0, 80) };
}

/** "Calle Mayor 3, 28013 Madrid" → the parts the template shows. */
function addressOf(address: string, city: string) {
  const postalCode = /\b\d{5}\b/.exec(address)?.[0];
  const street = address
    .replace(postalCode ?? '', '')
    .replace(new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '')
    .replace(/[\s,]+$/, '')
    .trim();
  return {
    street: (street || address).slice(0, 120),
    ...(postalCode ? { postalCode } : {}),
    city,
    region: city,
  };
}

/**
 * A preset's content with the request's business in it. The demo's made-up texts go: its
 * services, about, reviews and facts are dropped unless the request brings its own; its theme,
 * photos and calls to action stay as a starting point.
 */
export function contentFromRequest(base: SiteContent, request: SiteRequest): SiteContent {
  const b = request.business;
  const services = lines(b.services).slice(0, 24).map(serviceRow);
  const hours = lines(b.hours).slice(0, 10).map(hoursRow);
  const paragraphs = (b.about ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().slice(0, 1200))
    .filter(Boolean)
    .slice(0, 6);
  const whatsapp = b.whatsapp?.replace(/\D/g, '');
  const description = `${b.kind} en ${b.city}.${paragraphs[0] ? ` ${paragraphs[0]}` : ''}`;

  const content: SiteContent = {
    ...base,
    business: {
      ...base.business,
      name: b.name,
      tagline: `${b.kind} · ${b.city}`.slice(0, 80),
      description: description.slice(0, 300),
      schemaType: 'LocalBusiness',
    },
    contact: {
      phone: b.phone,
      whatsapp: whatsapp ? (whatsapp.length === 9 ? `34${whatsapp}` : whatsapp) : undefined,
      email: b.email,
      address: b.address ? addressOf(b.address, b.city) : undefined,
    },
    hours: hours.length > 0 ? hours : undefined,
    hero: {
      ...base.hero,
      eyebrow: `${b.kind} en ${b.city}`.slice(0, 80),
      title: b.name.slice(0, 120),
      text: (paragraphs[0] ?? `${b.kind} en ${b.city}.`).slice(0, 400),
      facts: undefined,
    },
    services:
      services.length > 0
        ? { title: base.services?.title ?? 'Servicios', items: services }
        : undefined,
    about: paragraphs.length > 0 ? { title: 'Sobre nosotros', paragraphs } : undefined,
    testimonials: undefined,
  };
  delete content.openingHoursSpec;
  return content;
}
