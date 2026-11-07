'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { createVideochatTicket, onboardVideochat, type VideochatTicket } from '@/lib/api/videochat';
import type { FormState } from '@/lib/forms';

/** Confirms 18+ and the rules (PUT /videochat/me); the page then shows the room. */
export async function onboardAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Videochat.onboarding' });
  const birthDate = String(formData.get('birthDate') ?? '');
  const termsVersion = String(formData.get('termsVersion') ?? '');
  const values = { birthDate };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) {
    return { status: 'error', fieldErrors: { birthDate: t('invalidDate') }, values };
  }
  if (formData.get('acceptTerms') !== 'on') {
    return { status: 'error', fieldErrors: { acceptTerms: t('mustAccept') }, values };
  }

  try {
    await onboardVideochat({ birthDate, acceptTerms: true, termsVersion });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 403) return { status: 'error', message: t('underage'), values };
    if (status === 400) {
      return { status: 'error', fieldErrors: { birthDate: t('invalidDate') }, values };
    }
    if (status === 409) return { status: 'error', message: t('rulesChanged'), values };
    return { status: 'error', message: t('error'), values };
  }
  revalidatePath(`/${locale}/videochat/room`);
  return { status: 'success' };
}

export type TicketResult =
  | { ok: true; ticket: VideochatTicket }
  | { ok: false; reason: 'suspended' | 'signed-out' | 'error' };

/** A single-use ticket for the signaling WebSocket, asked for server-side (BFF). */
export async function ticketAction(): Promise<TicketResult> {
  try {
    return { ok: true, ticket: await createVideochatTicket() };
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 401) return { ok: false, reason: 'signed-out' };
    if (status === 403) return { ok: false, reason: 'suspended' };
    return { ok: false, reason: 'error' };
  }
}
