import type { Allergen } from '../types';
import { site } from './site';

/** In the order of the regulation, with the names diners know them by. */
export const ALLERGENS: Record<Allergen, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustáceos',
  eggs: 'Huevo',
  fish: 'Pescado',
  peanuts: 'Cacahuetes',
  soybeans: 'Soja',
  milk: 'Lácteos',
  nuts: 'Frutos de cáscara',
  celery: 'Apio',
  mustard: 'Mostaza',
  sesame: 'Sésamo',
  sulphites: 'Sulfitos',
  lupin: 'Altramuces',
  molluscs: 'Moluscos',
};

export const MENU_PATH = '/carta';

/** The menu's link in the header: its title when short ("Carta", "Productos"), else "Carta". */
export const menuLabel = site.menu
  ? site.menu.title.length < 20
    ? site.menu.title
    : 'Carta'
  : undefined;
