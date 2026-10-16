import type { ImageMetadata } from 'astro';
import site from '@site/site';
import type { SiteImage } from '../types';

export { site };

const images = import.meta.glob<{ default: ImageMetadata }>(
  '@site/images/*.{jpg,jpeg,png,webp,avif}',
  {
    eager: true,
  },
);

/** The optimisable image behind a `SiteImage` (fails the build when the file is missing). */
export function imageOf(image: SiteImage): ImageMetadata {
  const entry = Object.entries(images).find(([path]) => path.endsWith(`/images/${image.file}`));
  if (!entry) throw new Error(`Image not found in images/: ${image.file}`);
  return entry[1].default;
}

/** `tel:` link of a phone written for people ("600 11 22 33"); inert on a demo. */
export const telHref = (phone: string) =>
  site.demo ? '#contacto' : `tel:${phone.replace(/[^\d+]/g, '')}`;

/** WhatsApp chat link, optionally with a first message; inert on a demo. */
export const whatsappHref = (number: string, text?: string) =>
  site.demo
    ? '#contacto'
    : `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Spanish addresses: "Calle Mayor 3, 28013 Madrid". */
export function addressLine(address: NonNullable<typeof site.contact.address>): string {
  return `${address.street}, ${address.postalCode ? `${address.postalCode} ` : ''}${address.city}`;
}
