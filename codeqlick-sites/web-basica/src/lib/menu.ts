import { ui } from './i18n';
import { type Lang, siteIn } from './site';

export const MENU_PATH = '/carta';

/** The menu's link in the header: its title when short ("Carta", "Productos"), else "Carta". */
export function menuLabel(lang: Lang = 'es'): string | undefined {
  const menu = siteIn(lang).menu;
  return menu ? (menu.title.length < 20 ? menu.title : ui[lang].menu) : undefined;
}
