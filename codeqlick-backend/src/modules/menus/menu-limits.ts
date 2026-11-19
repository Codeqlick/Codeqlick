/**
 * Menu's numbers (architecture 4.20, the owner's decisions of 2026-11-19), in one file so changing
 * one is a one-line change.
 */

export interface MenuPlanLimits {
  /** Menus per account. */
  menus: number;
  categories: number;
  itemsPerCategory: number;
  /** "Made with Codeqlick" on the public page and the poster. */
  showBadge: boolean;
}

const FREE_LIMITS: MenuPlanLimits = {
  menus: 1,
  categories: 20,
  itemsPerCategory: 60,
  showBadge: true,
};

/**
 * The limits of an account. Everyone has the free ones today; a paid plan later changes this
 * function and nothing else.
 */
export function menuLimits(_user: { id: string }): MenuPlanLimits {
  return FREE_LIMITS;
}

/** The whole content as JSON, in bytes. */
export const CONTENT_MAX_BYTES = 200 * 1024;
/** An old slug redirects for this long after a change. */
export const SLUG_REDIRECT_DAYS = 180;
/** At most this many slug changes in the window below. */
export const SLUG_CHANGES_MAX = 3;
export const SLUG_CHANGES_WINDOW_DAYS = 30;
/** Reports are kept this many months. */
export const REPORT_RETENTION_MONTHS = 12;

/** Currencies a menu can show (ISO 4217); the first is the default. */
export const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'MXN', 'COP', 'ARS', 'CLP'] as const;
export type MenuCurrency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: MenuCurrency = 'EUR';

/** The 14 allergens the EU requires restaurants to declare, in the order they are shown. */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type MenuAllergen = (typeof ALLERGENS)[number];
