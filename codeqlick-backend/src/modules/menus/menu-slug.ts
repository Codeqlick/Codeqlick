import { COMMON_RESERVED_SLUGS } from '../../common/reserved-slugs.js';

/** The app's own routes (and the two locales) that a menu's link can't take. */
const MENU_ROUTES = [
  'editar',
  'edit',
  'nueva',
  'new',
  'cartel',
  'poster',
  'reportar',
  'report',
  'qr',
  'disponibilidad',
  'en',
  'es',
];

export const RESERVED_MENU_SLUGS: ReadonlySet<string> = new Set([
  ...COMMON_RESERVED_SLUGS,
  ...MENU_ROUTES,
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

export type SlugProblem = 'invalid' | 'reserved';

/**
 * Why a slug can't be used (not whether it is taken), or null. A slug containing `codeqlick` is
 * reserved for admins (impersonation).
 */
export function slugProblem(slug: string, options: { admin: boolean }): SlugProblem | null {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    return 'invalid';
  }
  if (RESERVED_MENU_SLUGS.has(slug)) return 'reserved';
  if (!options.admin && slug.includes('codeqlick')) return 'reserved';
  return null;
}
