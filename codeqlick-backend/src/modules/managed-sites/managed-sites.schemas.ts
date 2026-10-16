import { z } from 'zod';

/** The demos of the template, which new managed sites start from. */
export const SITE_PRESETS = ['peluqueria', 'restaurante', 'fisioterapia'] as const;
export const sitePresetSchema = z.enum(SITE_PRESETS);

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A colour like #A84A33');
const href = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => /^(#|\/|https:\/\/|http:\/\/|tel:|mailto:)/.test(value),
    'A link: #section, /page, https://…, tel: or mailto:',
  );
/** `media/<name>` (an upload) or a file of the preset. */
const image = z
  .object({
    file: z
      .string()
      .regex(/^(media\/)?[\w-]{1,100}\.(jpe?g|png|webp|avif)$/i, 'An image file name'),
    alt: text(200),
  })
  .strict();
const link = z.object({ label: text(60), href }).strict();

/**
 * A managed site's content: the template's `Site` type (codeqlick-sites/web-basica/src/types.ts)
 * without `url`, `form` and `demo`, which are set when it is built. Keep both in step.
 */
export const siteContentSchema = z
  .object({
    business: z
      .object({
        name: text(80),
        tagline: optionalText(80),
        description: text(300),
        schemaType: z.string().regex(/^[A-Z][A-Za-z]{2,40}$/),
        priceRange: z.enum(['€', '€€', '€€€', '€€€€']).optional(),
      })
      .strict(),
    theme: z
      .object({
        primary: color,
        primaryText: color,
        background: color,
        surface: color,
        text: color,
        muted: color,
        headingFont: z.enum(['fraunces', 'playfair', 'outfit', 'inter']),
        bodyFont: z.enum(['inter', 'outfit']),
        corners: z.enum(['square', 'soft', 'round']),
      })
      .strict(),
    contact: z
      .object({
        phone: optionalText(30),
        whatsapp: z
          .string()
          .regex(/^\d{8,15}$/, 'International number without + or spaces: 34600111222')
          .optional(),
        email: z.email().max(254).optional(),
        address: z
          .object({
            street: text(120),
            postalCode: text(10),
            city: text(80),
            region: text(80),
          })
          .strict()
          .optional(),
        mapsUrl: z.url().max(500).optional(),
      })
      .strict(),
    hours: z
      .array(z.object({ days: text(60), hours: text(60) }).strict())
      .max(10)
      .optional(),
    openingHoursSpec: z.array(text(40)).max(10).optional(),
    social: z
      .object({
        instagram: z.url().optional(),
        facebook: z.url().optional(),
        tiktok: z.url().optional(),
        x: z.url().optional(),
      })
      .strict()
      .optional(),
    hero: z
      .object({
        eyebrow: optionalText(80),
        title: text(120),
        text: text(400),
        image,
        primary: link,
        secondary: link.optional(),
        facts: z
          .array(z.object({ value: text(20), label: text(40) }).strict())
          .max(3)
          .optional(),
      })
      .strict(),
    services: z
      .object({
        title: text(80),
        intro: optionalText(300),
        items: z
          .array(
            z
              .object({
                name: text(80),
                description: optionalText(200),
                price: optionalText(30),
              })
              .strict(),
          )
          .min(1)
          .max(24),
        note: optionalText(300),
      })
      .strict()
      .optional(),
    about: z
      .object({
        title: text(120),
        paragraphs: z.array(text(1200)).min(1).max(6),
        image: image.optional(),
        highlights: z.array(text(120)).max(6).optional(),
      })
      .strict()
      .optional(),
    gallery: z
      .object({ title: text(80), intro: optionalText(300), images: z.array(image).min(1).max(12) })
      .strict()
      .optional(),
    testimonials: z
      .object({
        title: text(80),
        items: z
          .array(
            z.object({ quote: text(600), author: text(80), detail: optionalText(80) }).strict(),
          )
          .min(1)
          .max(9),
      })
      .strict()
      .optional(),
    banner: z
      .object({ title: text(120), text: optionalText(300), link })
      .strict()
      .optional(),
    contactSection: z.object({ title: text(80), intro: optionalText(300) }).strict(),
    legal: z
      .object({
        owner: text(160),
        taxId: z.string().trim().max(20),
        address: z.string().trim().max(200),
        email: z.email().max(254),
        registry: optionalText(300),
      })
      .strict(),
    footerNote: optionalText(300),
  })
  .strict();
export type SiteContent = z.infer<typeof siteContentSchema>;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'Lowercase letters, digits and dashes');
const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'A domain like peluqueria.es');

export const createSiteSchema = z
  .object({ slug, preset: sitePresetSchema, domain: domain.nullable().optional() })
  .strict();
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = z.object({ domain: domain.nullable() }).strict();
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

export const siteContentBodySchema = z.object({ content: siteContentSchema }).strict();
export type SiteContentBody = z.infer<typeof siteContentBodySchema>;

export const revisionParamSchema = z.object({ id: z.uuid(), revisionId: z.uuid() });
export type RevisionParam = z.infer<typeof revisionParamSchema>;

/** One-step onboarding of a basic-website client (architecture 11.4). */
export const onboardSiteSchema = z
  .object({
    /** The contact person: their account (existing by email, or a new one with an invitation). */
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    locale: z.enum(['en', 'es']).default('es'),
    /** The business: the project's and the site's name. */
    businessName: z.string().trim().min(1).max(120),
    slug,
    preset: sitePresetSchema,
    domain: domain.nullable().optional(),
    /** A lead becomes the client (WON, linked) instead of creating the account here. */
    leadId: z.uuid().optional(),
  })
  .strict();
export type OnboardSiteInput = z.infer<typeof onboardSiteSchema>;

const shape = siteContentSchema.shape;

/**
 * What clients edit from the portal (architecture 11.5): texts, contact, hours, services,
 * reviews and photos. Brand, theme and legal data stay with the team.
 */
export const editableSiteSchema = z
  .object({
    tagline: z.string().trim().max(80).optional(),
    contact: shape.contact,
    hours: shape.hours,
    hero: z.object({ title: text(120), text: text(400) }).strict(),
    services: shape.services,
    about: z
      .object({ title: text(120), paragraphs: z.array(text(1200)).min(1).max(6) })
      .strict()
      .optional(),
    gallery: shape.gallery,
    testimonials: shape.testimonials,
  })
  .strict();
export type EditableSite = z.infer<typeof editableSiteSchema>;
