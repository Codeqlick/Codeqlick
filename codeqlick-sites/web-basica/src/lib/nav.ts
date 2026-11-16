import type { SectionKey } from '../types';
import { ui } from './i18n';
import { MENU_PATH, menuLabel } from './menu';
import { NEWS_PATH, posts } from './news';
import { type Lang, localize, sectionLabel, sectionOrder } from './site';

const HREFS: Record<SectionKey, string> = {
  services: '/#servicios',
  about: '/#nosotros',
  gallery: '/#galeria',
  testimonials: '/#opiniones',
};

/** Header links in a language: one per section the site has, in its order. */
export function navIn(lang: Lang) {
  const menu = menuLabel(lang);
  return [
    ...sectionOrder.map((key) => ({
      label: sectionLabel(key, lang),
      href: localize(HREFS[key], lang),
      edit: `navLabels.${key}` as string | undefined,
    })),
    ...(menu ? [{ label: menu, href: localize(MENU_PATH, lang), edit: undefined }] : []),
    ...(posts.length
      ? [{ label: ui[lang].news, href: localize(NEWS_PATH, lang), edit: undefined }]
      : []),
    { label: ui[lang].contact, href: localize('/#contacto', lang), edit: undefined },
  ];
}
