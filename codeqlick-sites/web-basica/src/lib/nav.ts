import type { SectionKey } from '../types';
import { MENU_PATH, menuLabel } from './menu';
import { NEWS_PATH, posts } from './news';
import { sectionLabel, sectionOrder } from './site';

const HREFS: Record<SectionKey, string> = {
  services: '/#servicios',
  about: '/#nosotros',
  gallery: '/#galeria',
  testimonials: '/#opiniones',
};

/** Header links: one per section the site has, in its order. */
export const nav = [
  ...sectionOrder.map((key) => ({
    label: sectionLabel(key),
    href: HREFS[key],
    edit: `navLabels.${key}`,
  })),
  ...(menuLabel ? [{ label: menuLabel, href: MENU_PATH, edit: undefined }] : []),
  ...(posts.length ? [{ label: 'Noticias', href: NEWS_PATH, edit: undefined }] : []),
  { label: 'Contacto', href: '/#contacto', edit: undefined },
];
