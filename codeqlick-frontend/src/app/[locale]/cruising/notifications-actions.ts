'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import {
  markCruisingNotificationsRead,
  setCruisingVisits,
  winkCruisingMember,
} from '@/lib/api/cruising-notifications';
import { isApiError } from '@/lib/api/errors';
import { isNickname } from '@/lib/cruising';
import type { FormState } from '@/lib/forms';

/**
 * Cruising's phase 6 actions (architecture 4.15): winks and profile visits (decision 97) and the
 * notification centre (decision 98). The browser never calls the API: these do, with the session.
 */

/** Every Cruising page in both languages shows what changed (the bell in the layout too). */
function refreshAll(): void {
  for (const each of routing.locales) revalidatePath(`/${each}/cruising`, 'layout');
}

const statusOf = (error: unknown) => (isApiError(error) ? error.status : 0);

/** Winks at a member (PUT /cruising/winks/:nickname): one per pair a day, 30 a day. */
export async function winkAction(
  locale: AppLocale,
  nickname: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.winks' });
  if (!isNickname(nickname)) return { status: 'error', message: t('error') };
  try {
    await winkCruisingMember(nickname);
  } catch (error) {
    const status = statusOf(error);
    if (status === 429) return { status: 'error', message: t('tooMany') };
    if (status === 404) return { status: 'error', message: t('notFound') };
    if (status === 409) return { status: 'error', message: t('needNickname') };
    if (status === 403) return { status: 'error', message: t('notAllowed') };
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success', message: t('sent') };
}

/** Turns profile visits on or off (PUT /cruising/visits/settings). */
export async function visitsSettingsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.visits' });
  const showVisits = formData.get('showVisits') === 'on';
  try {
    await setCruisingVisits(showVisits);
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success', message: showVisits ? t('savedOn') : t('savedOff') };
}

/** Marks every notification read (POST /cruising/notifications/read). */
export async function markAllReadAction(
  locale: AppLocale,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.notifications' });
  try {
    await markCruisingNotificationsRead();
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success', message: t('allRead') };
}
