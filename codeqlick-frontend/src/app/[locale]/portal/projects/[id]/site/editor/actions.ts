'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import {
  applySiteStyle,
  discardSiteDraft,
  publishSiteDraft,
  saveSiteDraft,
  uploadMySitePhoto,
} from '@/lib/api/portal-site';
import type { SiteEditorView } from '@/lib/api/types';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** What the editor gets back: the view, or the problem (field issues keyed by their path). */
export type EditorResult =
  | { ok: true; view: SiteEditorView }
  | { ok: false; errors: Record<string, string>; message?: 'invalid' | 'failed' | 'busy' };

async function attempt(
  locale: AppLocale,
  call: () => Promise<SiteEditorView>,
): Promise<EditorResult> {
  try {
    return { ok: true, view: await call() };
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    if (isApiError(error) && error.status === 400 && error.errors.length > 0) {
      return { ok: false, errors: error.fieldErrors, message: 'invalid' };
    }
    if (isApiError(error) && error.status === 429)
      return { ok: false, errors: {}, message: 'busy' };
    return { ok: false, errors: {}, message: 'failed' };
  }
}

/** Saves the draft as the client types; `rebuild` builds its preview again. */
export async function saveDraftAction(
  locale: AppLocale,
  projectId: string,
  input: { content: unknown; preset?: string; rebuild?: boolean },
): Promise<EditorResult> {
  return attempt(locale, () => saveSiteDraft(projectId, input));
}

export async function applyStyleAction(
  locale: AppLocale,
  projectId: string,
  preset: string,
): Promise<EditorResult> {
  return attempt(locale, () => applySiteStyle(projectId, preset));
}

/** The draft goes online. */
export async function publishDraftAction(
  locale: AppLocale,
  projectId: string,
): Promise<EditorResult> {
  const result = await attempt(locale, () => publishSiteDraft(projectId));
  if (result.ok) revalidatePath(`/${locale}/portal`, 'layout');
  return result;
}

/** Back to the published site. */
export async function discardDraftAction(locale: AppLocale, projectId: string): Promise<boolean> {
  try {
    await discardSiteDraft(projectId);
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    return false;
  }
  revalidatePath(`/${locale}/portal`, 'layout');
  return true;
}

/** A photo for the site: the `media/<file>` name the content uses, or what went wrong. */
export async function uploadEditorPhotoAction(
  locale: AppLocale,
  projectId: string,
  formData: FormData,
): Promise<{ file: string } | { error: 'tooLarge' | 'type' | 'failed' }> {
  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0) return { error: 'type' };
  if (photo.size > MAX_PHOTO_BYTES) return { error: 'tooLarge' };
  try {
    return { file: (await uploadMySitePhoto(projectId, photo)).file };
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    if (isApiError(error) && error.status === 400) return { error: 'type' };
    return { error: 'failed' };
  }
}
