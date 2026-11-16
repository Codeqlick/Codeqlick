'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import {
  addTrustedContact,
  deleteTrustedContact,
  endTimer,
  extendTimer,
  saveMyHealth,
  startTimer,
} from '@/lib/api/cruising-safety';
import { isApiError } from '@/lib/api/errors';
import {
  EXTEND_MINUTES,
  parseContactForm,
  parseHealthForm,
  parseTimerForm,
} from '@/lib/cruising-safety';
import type { FormState } from '@/lib/forms';

/**
 * Cruising's safety and health actions (architecture 4.15, phase 5): trusted contacts, the "Check
 * on me" timer (decision 95) and sexual health (decision 94).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The pages that show the timer, the contacts or the health fields (both languages). */
function refresh(): void {
  for (const each of routing.locales) revalidatePath(`/${each}/cruising`, 'layout');
}

const status = (error: unknown) => (isApiError(error) ? error.status : 0);

/** Names a trusted contact: they get the invitation by email. */
export async function addContactAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'CruisingSafety.contacts' });
  const { values, errors } = parseContactForm(formData);
  if (errors.email || errors.displayName) {
    return {
      status: 'error',
      fieldErrors: {
        ...(errors.email ? { email: t(`errors.email.${errors.email}`) } : {}),
        ...(errors.displayName
          ? { displayName: t(`errors.displayName.${errors.displayName}`) }
          : {}),
      },
      values,
    };
  }
  try {
    await addTrustedContact(values);
  } catch (error) {
    const code = status(error);
    if (code === 400) return { status: 'error', message: t('errors.self'), values };
    if (code === 409) return { status: 'error', message: t('errors.conflict'), values };
    if (code === 403) return { status: 'error', message: t('errors.notAllowed'), values };
    if (code === 429) return { status: 'error', message: t('errors.tooMany'), values };
    return { status: 'error', message: t('errors.error'), values };
  }
  refresh();
  return { status: 'success', message: t('added') };
}

/** Removes a pending or accepted contact. */
export async function removeContactAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'CruisingSafety.contacts' });
  if (!UUID.test(id)) return { status: 'error', message: t('errors.error') };
  try {
    await deleteTrustedContact(id);
  } catch {
    return { status: 'error', message: t('errors.error') };
  }
  refresh();
  return { status: 'success', message: t('removed') };
}

/** Starts the timer (ending one that runs). */
export async function startTimerAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'CruisingSafety.timer' });
  const parsed = parseTimerForm(formData);
  const values = { message: String(formData.get('message') ?? '') };
  if (!parsed.ok) {
    if (parsed.error === 'message') {
      return { status: 'error', fieldErrors: { message: t('errors.messageLong') }, values };
    }
    return { status: 'error', message: t('errors.error'), values };
  }
  try {
    await startTimer(parsed.input);
  } catch (error) {
    const code = status(error);
    if (code === 400) {
      return { status: 'error', fieldErrors: { message: t('errors.messageContact') }, values };
    }
    if (code === 409) return { status: 'error', message: t('errors.noContact'), values };
    if (code === 404) return { status: 'error', message: t('errors.spotGone'), values };
    if (code === 403) return { status: 'error', message: t('errors.notAllowed'), values };
    return { status: 'error', message: t('errors.error'), values };
  }
  refresh();
  return { status: 'success', message: t('started') };
}

export async function extendTimerAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'CruisingSafety.timer' });
  const minutes = Number(formData.get('minutes'));
  if (!EXTEND_MINUTES.some((value) => value === minutes)) {
    return { status: 'error', message: t('errors.error') };
  }
  try {
    await extendTimer(minutes);
  } catch (error) {
    const code = status(error);
    if (code === 400) return { status: 'error', message: t('errors.tooLong') };
    if (code === 404) return { status: 'error', message: t('errors.notRunning') };
    return { status: 'error', message: t('errors.error') };
  }
  refresh();
  return { status: 'success', message: t('extended') };
}

/** "I'm fine": ends the timer. */
export async function endTimerAction(
  locale: AppLocale,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'CruisingSafety.timer' });
  try {
    await endTimer();
  } catch {
    return { status: 'error', message: t('errors.error') };
  }
  refresh();
  return { status: 'success', message: t('ended') };
}

/** Turns sexual health on (with its own consent) and saves it, or off (deleting it). */
export async function saveHealthAction(
  locale: AppLocale,
  alreadyOn: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'CruisingHealth' });
  const values = {
    lastTestedMonth: String(formData.get('lastTestedMonth') ?? ''),
  };
  const parsed = parseHealthForm(formData, alreadyOn);
  if (!parsed.ok) {
    if (parsed.error === 'consent') {
      return { status: 'error', fieldErrors: { consent: t('errors.consent') }, values };
    }
    if (parsed.error === 'month') {
      return { status: 'error', fieldErrors: { lastTestedMonth: t('errors.month') }, values };
    }
    return { status: 'error', message: t('errors.error'), values };
  }
  try {
    await saveMyHealth(parsed.input);
  } catch (error) {
    if (status(error) === 400) return { status: 'error', message: t('errors.month'), values };
    return { status: 'error', message: t('errors.error'), values };
  }
  refresh();
  return { status: 'success', message: parsed.input.enabled ? t('saved') : t('deleted') };
}
