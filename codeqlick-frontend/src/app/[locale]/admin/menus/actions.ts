'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { failedState } from '@/lib/actions';
import { localeOrDefault } from '@/i18n/locale';
import { SITE_LOCALES } from '@/i18n/routing';
import { adminCloseMenuReport, adminSuspendMenu, adminUnsuspendMenu } from '@/lib/api/menus';
import { formString, formValues, type FormState } from '@/lib/forms';

/** A menu's public page answers differently once suspended or lifted: refresh both languages. */
function revalidatePublicPage(slug: string) {
  for (const locale of SITE_LOCALES) revalidatePath(`/${locale}/menu/${slug}`);
}

/** Suspends a menu with a reason (5-500): its page answers like a missing one and the owner is told. */
export async function suspendMenuAction(
  locale: string,
  id: string,
  slug: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Admin.menus' });
  const reason = formString(formData, 'reason');
  if (reason.length < 5 || reason.length > 500) {
    return {
      status: 'error',
      fieldErrors: { reason: t('reasonHint') },
      values: formValues(formData),
    };
  }
  try {
    await adminSuspendMenu(id, reason);
  } catch (error) {
    return failedState(error, lang, formData);
  }
  revalidatePath(`/${lang}/admin/menus`);
  revalidatePublicPage(slug);
  return { status: 'success', message: t('suspended') };
}

/** Lifts a suspension: the menu is back as it was. */
export async function unsuspendMenuAction(
  locale: string,
  id: string,
  slug: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Admin.menus' });
  try {
    await adminUnsuspendMenu(id);
  } catch (error) {
    return failedState(error, lang, formData);
  }
  revalidatePath(`/${lang}/admin/menus`);
  revalidatePublicPage(slug);
  return { status: 'success', message: t('unsuspended') };
}

/** Closes a report, with an optional note. */
export async function closeReportAction(
  locale: string,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Admin.menus' });
  const note = formString(formData, 'note').slice(0, 500);
  try {
    await adminCloseMenuReport(id, note || undefined);
  } catch (error) {
    return failedState(error, lang, formData);
  }
  revalidatePath(`/${lang}/admin/menus`);
  return { status: 'success', message: t('closed') };
}
