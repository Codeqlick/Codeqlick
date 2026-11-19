'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { SITE_LOCALES } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import {
  checkMenuSlug,
  createMenu,
  deleteMenu,
  getMenu,
  reportMenu,
  setMenuItemFlags,
  updateMenuSettings,
} from '@/lib/api/menus';
import { formString, formValues, type FormState } from '@/lib/forms';
import {
  contentForApi,
  issueKind,
  mapIssuePaths,
  MENU_REPORT_REASONS,
  type MenuContent,
  type MenuReportReason,
  type MenuSettings,
  type MenuView,
} from '@/lib/menu';
import { appPath } from '@/lib/webapp-request';

/** What the editor sends to be saved. `revision` is the one it loaded (none for a new menu). */
export type SaveMenuInput = {
  id: string | null;
  revision: number;
  settings: MenuSettings;
  content: MenuContent;
  /** What changed since it was loaded: only that is sent. */
  changed: { settings: boolean; content: boolean };
};

export type SaveMenuResult =
  | { ok: true; menu: MenuView }
  | {
      ok: false;
      reason: 'invalid' | 'stale' | 'limit' | 'slugLimit' | 'suspended' | 'notFound' | 'failed';
      /** Field errors by path, already in the person's language. */
      errors: Record<string, string>;
    };

/** Pages that show a menu: its public page in both languages, and the app's own list. */
function revalidateMenu(slugs: readonly string[]) {
  for (const locale of SITE_LOCALES) {
    revalidatePath(`/${locale}/menu`);
    for (const slug of slugs) revalidatePath(`/${locale}/menu/${slug}`);
  }
}

type EditorT = (key: string) => string;

/** An API field error in the person's language. */
function friendly(message: string, t: EditorT): string {
  const kind = issueKind(message);
  return kind === 'other' ? message : t(`issues.${kind}`);
}

/** Turns what the API refused into the editor's result. */
function failure(error: unknown, t: EditorT): Extract<SaveMenuResult, { ok: false }> {
  if (!isApiError(error)) return { ok: false, reason: 'failed', errors: {} };
  if (error.status === 422 || error.status === 400) {
    const errors = Object.fromEntries(
      Object.entries(mapIssuePaths(error.errors)).map(([path, message]) => [
        path,
        friendly(message, t),
      ]),
    );
    return { ok: false, reason: 'invalid', errors };
  }
  if (error.status === 409) {
    if (error.code === 'STALE_REVISION') return { ok: false, reason: 'stale', errors: {} };
    if (error.code === 'MENU_LIMIT') return { ok: false, reason: 'limit', errors: {} };
    if (error.code === 'SLUG_CHANGE_LIMIT') return { ok: false, reason: 'slugLimit', errors: {} };
    return { ok: false, reason: 'invalid', errors: { slug: t('issues.taken') } };
  }
  if (error.status === 403) return { ok: false, reason: 'suspended', errors: {} };
  if (error.status === 404) return { ok: false, reason: 'notFound', errors: {} };
  return { ok: false, reason: 'failed', errors: {} };
}

function settingsBody(settings: MenuSettings): MenuSettings {
  const { slug, kind, businessName, language, currency } = settings;
  return {
    slug: slug.trim(),
    kind,
    businessName: businessName.trim(),
    language,
    currency,
    title: settings.title.trim(),
    intro: settings.intro.trim(),
    address: settings.address.trim(),
    openingNote: settings.openingNote.trim(),
    note: settings.note.trim(),
    enabled: Boolean(settings.enabled),
    indexable: Boolean(settings.indexable),
  };
}

/**
 * Creates a menu (then opens it) or saves the changes of one: a single `PATCH` with the settings,
 * the content when it changed and the revision the editor loaded, written together by the API.
 */
export async function saveMenuAction(
  locale: string,
  input: SaveMenuInput,
): Promise<SaveMenuResult> {
  const lang = localeOrDefault(locale);
  const translate = await getTranslations({ locale: lang, namespace: 'Menu.editor' });
  const t: EditorT = (key) => translate(key as never);
  const settings = settingsBody(input.settings);
  const content = contentForApi(input.content, settings.kind);
  try {
    if (!input.id) {
      // A menu nobody has written in yet starts from the API's own empty content.
      const written = content.categories.some(
        (category) => category.name || category.items.some((item) => item.name),
      );
      const created = await createMenu({ ...settings, ...(written ? { content } : {}) });
      revalidateMenu([created.slug]);
      redirect(await appPath(`/${lang}/menu/editar/${created.id}?created=1`, lang));
    }
    // One call: settings and content are written together, in one transaction. A failure
    // writes nothing, so the revision the editor holds stays the right one.
    const menu: MenuView =
      input.changed.settings || input.changed.content
        ? await updateMenuSettings(input.id, {
            ...settings,
            revision: input.revision,
            ...(input.changed.content ? { content } : {}),
          })
        : await getMenu(input.id);
    // A renamed menu's old link now redirects: refresh it too (newest first, from the API).
    const old = menu.redirects?.[0]?.slug;
    revalidateMenu(old && old !== menu.slug ? [menu.slug, old] : [menu.slug]);
    return { ok: true, menu };
  } catch (error) {
    // `redirect` throws its own signal: let it through.
    if (!isApiError(error)) throw error;
    return failure(error, t);
  }
}

/** The slug field's live check. */
export async function checkSlugAction(
  slug: string,
  menuId: string | null,
): Promise<{ available: boolean; reason?: 'taken' | 'reserved' | 'invalid' } | null> {
  try {
    return await checkMenuSlug(slug.slice(0, 80), menuId ?? undefined);
  } catch {
    return null;
  }
}

/** Pauses a menu or puts it online again (the revision is read first: the list has none). */
export async function toggleMenuAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const id = formString(formData, 'id');
  const enabled = formString(formData, 'enabled') === 'on';
  try {
    const menu = await getMenu(id);
    await updateMenuSettings(id, { enabled, revision: menu.revision });
    revalidateMenu([menu.slug]);
  } catch {
    revalidatePath(`/${locale}/menu`);
  }
}

/** Deletes a menu: its content and old links go with it. Back to the app's home. */
export async function deleteMenuAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const id = formString(formData, 'id');
  // The slug comes from the API, never from the form.
  const menu = await getMenu(id).catch(() => null);
  await deleteMenu(id).catch(() => undefined);
  revalidateMenu(menu ? [menu.slug, ...(menu.redirects ?? []).map((r) => r.slug)] : []);
  redirect(await appPath(`/${locale}/menu`, locale));
}

/** The availability page's two switches: sold out and hidden, saved at once. */
export async function setItemFlagAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const id = formString(formData, 'id');
  const key = formString(formData, 'key');
  const field = formString(formData, 'field');
  const value = formString(formData, 'value') === 'on';
  if (field !== 'soldOut' && field !== 'hidden') return;
  try {
    await setMenuItemFlags(id, key, { [field]: value });
    const menu = await getMenu(id).catch(() => null);
    revalidateMenu(menu ? [menu.slug] : []);
  } catch {
    // The page reloads with what the API has.
  }
  revalidatePath(`/${locale}/menu/disponibilidad/${id}`);
}

/** Nobody fills in a report form this fast (see the contact form). */
const MIN_FILL_MS = 3000;

/** The public report form: stored for the team, who decide (nothing happens by itself). */
export async function reportMenuAction(
  locale: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Menu.report' });
  const tv = await getTranslations({ locale: lang, namespace: 'Validation' });
  const values = formValues(formData, ['website', 'renderedAt']);
  const slug = formString(formData, 'slug').toLowerCase().replace(/^\/+/, '');
  const reason = formString(formData, 'reason') as MenuReportReason;
  const details = formString(formData, 'details');
  const email = formString(formData, 'email');
  const renderedAt = Number(formString(formData, 'renderedAt'));
  const fieldErrors: Record<string, string> = {};
  if (slug.length < 3) fieldErrors.slug = tv('required');
  if (!MENU_REPORT_REASONS.includes(reason)) fieldErrors.reason = tv('choice');
  if (details.length < 10 || details.length > 1000) fieldErrors.details = t('detailsHint');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = tv('email');
  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: t('invalid'), fieldErrors, values };
  }
  const tooFast = !Number.isFinite(renderedAt) || Date.now() - renderedAt < MIN_FILL_MS;
  try {
    await reportMenu({
      slug,
      reason,
      details,
      email: email || undefined,
      // A form filled in faster than a person could goes to the API's honeypot.
      website: tooFast ? 'fast' : formString(formData, 'website') || undefined,
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 404) {
      return {
        status: 'error',
        message: t('notFound'),
        fieldErrors: { slug: t('notFound') },
        values,
      };
    }
    if (status === 429) return { status: 'error', message: t('tooMany'), values };
    if (status === 400 || status === 422) {
      return { status: 'error', message: t('invalid'), values };
    }
    return { status: 'error', message: t('failed'), values };
  }
  return { status: 'success', message: t('sent') };
}
