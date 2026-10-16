import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { SiteRequest } from './site-request.js';

/** The basic website's price, in cents (the "Desde 200 €" of /basic-website). */
export const BASIC_WEBSITE_PRICE = 20_000;
const VALID_DAYS = 30;

const STYLES: Record<ApiLocale, Record<string, string>> = {
  es: {
    peluqueria: 'Peluquería (como Alba Estudio)',
    restaurante: 'Restaurante (como Casa Lola)',
    fisioterapia: 'Clínica (como Fisio Retiro)',
    portfolio: 'Portfolio (como Nora Vidal)',
    despacho: 'Despacho profesional (como Ortega & Sanz)',
    comercio: 'Tienda (como Flores Abril)',
    reformas: 'Reformas y oficios (como Reformas Duero)',
    general: 'A medida de tu negocio',
  },
  en: {
    peluqueria: 'Hair salon (like Alba Estudio)',
    restaurante: 'Restaurant (like Casa Lola)',
    fisioterapia: 'Clinic (like Fisio Retiro)',
    portfolio: 'Portfolio (like Nora Vidal)',
    despacho: 'Professional office (like Ortega & Sanz)',
    comercio: 'Shop (like Flores Abril)',
    reformas: 'Trades (like Reformas Duero)',
    general: 'Made to fit your business',
  },
};

const INCLUDED: Record<ApiLocale, string[]> = {
  es: [
    'Portada, servicios con precios, sobre nosotros, galería de hasta 6 fotos, opiniones, horario y contacto',
    'Formulario de contacto que te llega por email',
    'Botón de WhatsApp y llamada a un toque desde el móvil',
    'Aviso legal, privacidad y cookies, sin cookies de terceros: no necesita banner',
    'Preparada para Google: títulos, descripciones, sitemap y datos de negocio local',
    'Publicación con HTTPS en tu dominio y dos rondas de cambios',
    'Un área de cliente desde la que cambias tus textos, horario, servicios y fotos',
  ],
  en: [
    'Home, services with prices, about, a gallery of up to 6 photos, reviews, opening hours and contact',
    'A contact form that reaches you by email',
    'WhatsApp and one-tap call buttons on mobile',
    'Legal notice, privacy and cookie pages, with no third-party cookies: no banner needed',
    'Ready for Google: titles, descriptions, sitemap and local business data',
    'Published over HTTPS on your domain, with two rounds of changes',
    'A client area where you change your texts, hours, services and photos',
  ],
};

export interface RequestProposal {
  title: string;
  summary: string;
  terms: string;
  validUntil: string;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
}

/** `yyyy-mm-dd` plus `days`. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The draft proposal for a basic-website request (architecture 8.2), in the lead's language: the
 * team reviews it before sending. `today`: `yyyy-mm-dd` in Madrid.
 */
export function proposalFromRequest(
  request: SiteRequest,
  locale: ApiLocale,
  today: string,
): RequestProposal {
  const b = request.business;
  const es = locale === 'es';
  const style = STYLES[locale][request.preset] ?? request.preset;
  const domain = request.domain
    ? es
      ? `${request.domain.name} (${request.domain.owned ? 'ya es tuyo: lo conectamos' : 'lo registras a tu nombre y lo conectamos'})`
      : `${request.domain.name} (${request.domain.owned ? 'you already have it: we connect it' : 'you register it in your name and we connect it'})`
    : es
      ? 'El que elijas: lo registras a tu nombre y lo conectamos'
      : 'The one you choose: you register it in your name and we connect it';
  const summary = [
    es
      ? `Una web de una página para **${b.name}**, ${b.kind.toLowerCase()} en ${b.city}, hecha a partir de la vista previa que ya has visto.`
      : `A one-page website for **${b.name}**, ${b.kind.toLowerCase()} in ${b.city}, built from the preview you have already seen.`,
    '',
    es ? `- **Estilo:** ${style}` : `- **Style:** ${style}`,
    es ? `- **Dominio:** ${domain}` : `- **Domain:** ${domain}`,
    ...(b.wishes
      ? [
          '',
          es ? '**Lo que nos pediste:**' : '**What you asked for:**',
          '',
          `> ${b.wishes.replace(/\n/g, '\n> ')}`,
        ]
      : []),
    '',
    es ? '## Qué incluye' : "## What's included",
    '',
    ...INCLUDED[locale].map((line) => `- ${line}`),
    '',
    es
      ? 'Tú nos pasas tus fotos y los textos que quieras cambiar; nosotros la dejamos lista y la publicamos.'
      : 'You send us your photos and any texts you want changed; we finish it and publish it.',
  ].join('\n');
  const terms = (
    es
      ? [
          'Pago único. Incluye dos rondas de cambios antes de publicarla.',
          'El dominio es tuyo: lo registras a tu nombre (unos 10–15 € al año) y lo pagas aparte.',
          'Mantenimiento opcional después de publicarla.',
        ]
      : [
          'One-off payment. Includes two rounds of changes before it is published.',
          'The domain is yours: you register it in your name (about 10–15 € a year) and pay it separately.',
          'Optional maintenance once it is published.',
        ]
  )
    .map((line) => `- ${line}`)
    .join('\n');
  return {
    title: (es ? `Web de ${b.name}` : `${b.name} website`).slice(0, 200),
    summary,
    terms,
    validUntil: addDays(today, VALID_DAYS),
    items: [
      {
        description: es ? 'Web básica de una página' : 'One-page basic website',
        quantity: 1,
        unitPrice: BASIC_WEBSITE_PRICE,
      },
    ],
  };
}
