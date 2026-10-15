'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { failedState, invalidState, savedState, unconfirmedDelete } from '@/lib/actions';
import {
  adminCreateProject,
  adminCreateProjectUpdate,
  adminDeleteProject,
  adminDeleteProjectFile,
  adminUpdateProject,
} from '@/lib/api/projects';
import { formBoolean, formObject, type FormState } from '@/lib/forms';
import { projectFormSchema, projectUpdateSchema } from '@/lib/schemas/admin';

const PROJECT_FIELDS = [
  'clientId',
  'name',
  'description',
  'phase',
  'progress',
  'startDate',
  'dueDate',
  'stagingUrl',
  'productionUrl',
] as const;

/** Portal and admin pages both show project data. */
function revalidateProjects(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

export async function createProjectAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = projectFormSchema.safeParse(formObject(formData, PROJECT_FIELDS));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  let id: string;
  try {
    id = (await adminCreateProject(parsed.data)).id;
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateProjects(locale);
  redirect(`/${locale}/admin/projects/${id}`);
}

export async function updateProjectAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = projectFormSchema.safeParse(formObject(formData, PROJECT_FIELDS));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await adminUpdateProject(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateProjects(locale);
  return savedState(locale);
}

export async function postProjectUpdateAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = projectUpdateSchema.safeParse({
    ...formObject(formData, ['title', 'body']),
    notifyClient: formBoolean(formData, 'notifyClient'),
  });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  let clientNotified: boolean | undefined;
  try {
    ({ clientNotified } = await adminCreateProjectUpdate(id, parsed.data));
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateProjects(locale);
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });
  // The update is posted either way; only the email can have failed.
  if (clientNotified === false) return { status: 'error', message: t('updatePostedNotNotified') };
  return {
    status: 'success',
    message: clientNotified ? t('updatePostedNotified') : t('updatePosted'),
  };
}

export async function deleteProjectAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;

  try {
    await adminDeleteProject(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateProjects(locale);
  redirect(`/${locale}/admin/projects`);
}

export async function deleteProjectFileAction(
  locale: AppLocale,
  id: string,
  fileId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;

  try {
    await adminDeleteProjectFile(id, fileId);
  } catch (error) {
    // Already gone (deleted from another tab): refreshing the list is all that is left to do.
    if (!(isApiError(error) && error.status === 404)) return failedState(error, locale, formData);
  }

  revalidateProjects(locale);
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });
  return { status: 'success', message: t('fileDeleted') };
}
