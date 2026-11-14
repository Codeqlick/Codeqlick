import { env } from '@/lib/env';

/**
 * Where Codeqlick Cloud's documentation is for a locale: `<base>/<locale>/` on the public
 * documentation site when `base` (CLOUD_DOCS_URL) is set, else the console's own `/cloud/docs`
 * path (locale-aware, for `<Link>`). `base` has no trailing slash.
 */
export function cloudDocsHref(base: string | undefined, locale: string): string {
  return base ? `${base}/${locale}/` : '/cloud/docs';
}

/** The documentation address every link to it uses (server only: it reads the environment). */
export function cloudDocsUrl(locale: string): string {
  return cloudDocsHref(env.CLOUD_DOCS_URL, locale);
}
