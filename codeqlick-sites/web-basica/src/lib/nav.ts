import type { SectionKey } from '../types';
import { sectionLabel, sectionOrder } from './site';

const HREFS: Record<SectionKey, string> = {
  services: '/#servicios',
  about: '/#nosotros',
  gallery: '/#galeria',
  testimonials: '/#opiniones',
};

/** Header links: one per section the site has, in its order. */
export const nav = [
  ...sectionOrder.map((key) => ({ label: sectionLabel(key), href: HREFS[key] })),
  { label: 'Contacto', href: '/#contacto' },
];
