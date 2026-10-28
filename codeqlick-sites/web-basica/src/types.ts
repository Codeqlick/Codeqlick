/**
 * Everything a site shows comes from `site/site.ts` (or `examples/<name>/site.ts` with
 * `SITE_DIR=examples/<name>`): one object of this type. Images are file names in the same
 * folder's `images/`.
 */

export interface SiteImage {
  /** File in `images/`, e.g. `hero.jpg`. */
  file: string;
  /** Describes the photo for screen readers and search engines. */
  alt: string;
}

export interface Link {
  label: string;
  href: string;
}

export type HeadingFont = 'fraunces' | 'playfair' | 'outfit' | 'inter';
export type BodyFont = 'inter' | 'outfit';

/** The sections between the hero and the contact, which a site may reorder. */
export type SectionKey = 'services' | 'about' | 'gallery' | 'testimonials';

export interface Site {
  /** A demo of a made-up business: phone and WhatsApp links don't dial anyone. */
  demo?: boolean;
  /** A preview built from a website request: noindex everywhere and a bar saying so on top. */
  preview?: boolean;
  /**
   * The draft being edited in the portal (built under SITE_BASE): noindex, links disabled, texts
   * marked with `data-edit` paths that the editor patches live through `postMessage`.
   */
  draft?: boolean;
  /** Public address, without a trailing slash: `https://peluqueriamarta.es`. */
  url: string;
  business: {
    name: string;
    /** Short line under the name in the header (optional). */
    tagline?: string;
    /** For search engines and link previews: 140–160 characters. */
    description: string;
    /** schema.org type: `HairSalon`, `Restaurant`, `Physiotherapy`, `Dentist`, `LocalBusiness`… */
    schemaType: string;
    /** Price range for search engines: `€`, `€€`, `€€€`. */
    priceRange?: string;
  };
  theme: {
    /** Buttons, links and accents. Must have 4.5:1 contrast with `primaryText`. */
    primary: string;
    /** Text on `primary` (usually `#ffffff`). */
    primaryText: string;
    /** Page background. */
    background: string;
    /** Cards and alternate sections. */
    surface: string;
    text: string;
    /** Secondary text. Must have 4.5:1 contrast with `background` and `surface`. */
    muted: string;
    headingFont: HeadingFont;
    bodyFont: BodyFont;
    /** Corner rounding of cards, images and buttons. */
    corners: 'square' | 'soft' | 'round';
  };
  contact: {
    phone?: string;
    /** International format without spaces or +: `34600111222`. Shows a floating button. */
    whatsapp?: string;
    email?: string;
    address?: {
      street: string;
      postalCode?: string;
      city: string;
      region: string;
    };
    /** "Cómo llegar" link (Google Maps or OpenStreetMap); no embedded map, so no cookies. */
    mapsUrl?: string;
    /** The business's "write a review" link on Google: the reviews section links to it. */
    reviewUrl?: string;
  };
  /** Opening hours, as shown: `{ days: 'Lunes a viernes', hours: '9:00–20:00' }`. */
  hours?: Array<{ days: string; hours: string }>;
  /** For search engines (schema.org openingHours): `['Mo-Fr 09:00-20:00', 'Sa 09:00-14:00']`. */
  openingHoursSpec?: string[];
  social?: { instagram?: string; facebook?: string; tiktok?: string; x?: string };
  /**
   * The contact form. `key`: the project's form key (Admin → project → Formulario de la web).
   * `demo`: shows the form but doesn't send. Leave it out to hide the form.
   */
  form?: { key: string; api?: string } | { demo: true };
  hero: {
    eyebrow?: string;
    title: string;
    text: string;
    image: SiteImage;
    primary: Link;
    secondary?: Link;
    /** Up to 3 short facts under the buttons: `{ value: '15 años', label: 'en el barrio' }`. */
    facts?: Array<{ value: string; label: string }>;
  };
  services?: {
    title: string;
    intro?: string;
    items: Array<{ name: string; description?: string; price?: string }>;
    note?: string;
  };
  about?: {
    title: string;
    paragraphs: string[];
    image?: SiteImage;
    highlights?: string[];
  };
  gallery?: { title: string; intro?: string; images: SiteImage[] };
  testimonials?: {
    title: string;
    items: Array<{ quote: string; author: string; detail?: string }>;
  };
  /**
   * Order of the middle sections (default: services, about, gallery, testimonials); a portfolio
   * shows its gallery first. Sections the site doesn't have are skipped.
   */
  sections?: SectionKey[];
  /** Header labels of the sections, e.g. a portfolio's "Trabajos" or "Sobre mí". */
  navLabels?: Partial<Record<SectionKey, string>>;
  /** Closing call to action before the contact section. */
  banner?: { title: string; text?: string; link: Link };
  contactSection: { title: string; intro?: string };
  /** Data the legal pages need (LSSI and RGPD). Check it with the client. */
  legal: {
    /** Full name or company name of the owner. */
    owner: string;
    /** NIF / CIF. */
    taxId: string;
    address: string;
    email: string;
    /** Companies: "Inscrita en el Registro Mercantil de …". */
    registry?: string;
  };
  /** Shown in the footer, e.g. photo credits of a demo. */
  footerNote?: string;
  /**
   * Cookieless visit statistics (Umami). Set by the site builder for managed sites; the privacy
   * and cookie pages mention it when present.
   */
  analytics?: { websiteId: string; scriptUrl: string };
}
