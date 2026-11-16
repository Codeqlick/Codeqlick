'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import {
  createHealthCenter,
  deleteHealthCenter,
  importHealthCenters,
  updateHealthCenter,
  type HealthImportResult,
} from '@/lib/api/cruising-safety';
import { SWIPE_COUNTRIES } from '@/lib/countries';
import { SPOT_IMPORT_MAX_BYTES, spotImportFormat, type SpotImportState } from '@/lib/cruising';
import { parseCenterForm } from '@/lib/cruising-safety';
import type { FormState } from '@/lib/forms';

/** The team's testing centres (decision 94): add, correct, delete and import. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(locale: AppLocale): void {
  revalidatePath(`/${locale}/admin/cruising/health`);
  for (const each of routing.locales) revalidatePath(`/${each}/cruising/health`);
}

async function invalid(locale: AppLocale, form: ReturnType<typeof parseCenterForm>) {
  const t = await getTranslations({ locale, namespace: 'AdminCruisingHealth.errors' });
  return {
    status: 'error' as const,
    fieldErrors: Object.fromEntries(form.errors.map((key) => [key, t(key)])),
    values: form.values,
  };
}

export async function createCenterAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const form = parseCenterForm(formData, SWIPE_COUNTRIES);
  if (!form.data) return invalid(locale, form);
  try {
    await createHealthCenter(form.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  refresh(locale);
  const t = await getTranslations({ locale, namespace: 'AdminCruisingHealth' });
  return { status: 'success', message: t('added') };
}

export async function updateCenterAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const form = parseCenterForm(formData, SWIPE_COUNTRIES);
  if (!UUID.test(id)) return { status: 'error' };
  if (!form.data) return invalid(locale, form);
  try {
    await updateHealthCenter(id, form.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  refresh(locale);
  const t = await getTranslations({ locale, namespace: 'AdminCruisingHealth' });
  return { status: 'success', message: t('saved') };
}

export async function deleteCenterAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!UUID.test(id)) return { status: 'error' };
  try {
    await deleteHealthCenter(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  refresh(locale);
  const t = await getTranslations({ locale, namespace: 'AdminCruisingHealth' });
  return { status: 'success', message: t('deleted') };
}

/** A CSV or GeoJSON file of centres, checked first (dry run), like the spots' import. */
export async function importCentersAction(
  locale: AppLocale,
  _previous: SpotImportState,
  formData: FormData,
): Promise<SpotImportState> {
  const t = await getTranslations({ locale, namespace: 'CruisingSpotImport' });
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: t('chooseFile') };
  }
  if (file.size > SPOT_IMPORT_MAX_BYTES) return { status: 'error', message: t('tooBig') };
  const format = spotImportFormat(file.name, String(formData.get('format') ?? ''));
  if (!format) return { status: 'error', message: t('chooseFormat') };
  const dryRun = formData.get('intent') !== 'import';
  let result: HealthImportResult;
  try {
    result = await importHealthCenters({ format, content: await file.text(), dryRun });
  } catch (error) {
    const failed = await failedState(error, locale, new FormData());
    return { status: 'error', message: failed.message };
  }
  if (!dryRun && result.created > 0) refresh(locale);
  return {
    status: 'success',
    dryRun,
    result,
    message: dryRun
      ? t('healthChecked', { create: result.items.length, skip: result.skipped.length })
      : t('healthImported', { count: result.created, skip: result.skipped.length }),
  };
}
