'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { adminCheckLink } from '@/lib/api/links';
import type { FormState } from '@/lib/forms';

/** "Check again": re-checks one link now (10 a minute), then refreshes the list and the dashboard. */
export async function checkLinkAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'AdminLinks' });
  let ok: boolean;
  try {
    ok = (await adminCheckLink(id)).status === 'OK';
  } catch (error) {
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('tooManyChecks') };
    }
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin/links`);
  revalidatePath(`/${locale}/admin`);
  return { status: 'success', message: t(ok ? 'checkedOk' : 'checkedBroken') };
}
