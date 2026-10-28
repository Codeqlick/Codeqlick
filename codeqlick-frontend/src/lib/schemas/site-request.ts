import { z } from 'zod';
import { SITE_PRESETS, type SiteRequest } from '@/lib/api/types';

const optional = (max: number) => z.string().trim().max(max, 'tooLong');
const required = (max: number) => optional(max).min(1, 'required');
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * A basic-website request's fields as its forms post them (the public request, and the admin's
 * prospect and request editor, SiteRequestFields): validation keys of the Validation messages.
 */
export const siteRequestFieldsSchema = z.object({
  preset: z.enum(SITE_PRESETS, 'choice'),
  businessName: required(80),
  kind: required(80),
  city: required(80),
  address: optional(160),
  phone: optional(30),
  whatsapp: optional(30),
  businessEmail: z.union([z.literal(''), z.email('email').max(254)]),
  hours: optional(1000),
  services: optional(3000),
  about: optional(3000),
  wishes: optional(3000),
  domainChoice: z.enum(['new', 'owned', 'none'], 'choice').catch('none'),
  domainName: optional(253),
});
export type SiteRequestFields = z.infer<typeof siteRequestFieldsSchema>;

/** The chosen domain must look like one, unless there is none. */
export function checkDomain(
  value: Pick<SiteRequestFields, 'domainChoice' | 'domainName'>,
  context: z.RefinementCtx,
) {
  if (value.domainChoice === 'none') return;
  if (!DOMAIN.test(value.domainName.toLowerCase().replace(/^www\./, ''))) {
    context.addIssue({ code: 'custom', path: ['domainName'], message: 'domain' });
  }
}

const blank = (value: string) => value || undefined;

/** The request the API takes, from the parsed fields. */
export function toSiteRequest(d: SiteRequestFields): SiteRequest {
  return {
    preset: d.preset,
    business: {
      name: d.businessName,
      kind: d.kind,
      city: d.city,
      address: blank(d.address),
      phone: blank(d.phone),
      whatsapp: blank(d.whatsapp),
      email: blank(d.businessEmail),
      hours: blank(d.hours),
      services: blank(d.services),
      about: blank(d.about),
      wishes: blank(d.wishes),
    },
    ...(d.domainChoice === 'none'
      ? {}
      : {
          domain: {
            name: d.domainName.toLowerCase().replace(/^www\./, ''),
            owned: d.domainChoice === 'owned',
          },
        }),
  };
}
