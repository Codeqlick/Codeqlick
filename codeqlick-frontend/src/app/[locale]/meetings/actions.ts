'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { MeetingTicketResult } from '@/components/meetings/MeetingRoom';
import { localeOrDefault } from '@/i18n/locale';
import { redirect } from 'next/navigation';
import { isApiError } from '@/lib/api/errors';
import {
  createMeetingGuestTicket,
  createMeetingRoom,
  createMeetingTicket,
  deleteMeetingRoom,
  updateMeetingRoom,
} from '@/lib/api/meetings';
import { getCurrentUser } from '@/lib/auth/session';
import type { FormState } from '@/lib/forms';
import { normalizeMeetingCode } from '@/lib/meetings';

/** A new room (POST /meetings/rooms); its link shows in the list. */
export async function createRoomAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Meetings.rooms' });
  const title = String(formData.get('title') ?? '').trim();
  const values = { title };
  if (title.length < 1 || title.length > 80) {
    return { status: 'error', fieldErrors: { title: t('titleInvalid') }, values };
  }
  try {
    await createMeetingRoom(title);
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    return { status: 'error', message: t(status === 409 ? 'tooMany' : 'error'), values };
  }
  revalidatePath(`/${locale}/meetings`);
  return { status: 'success', message: t('created') };
}

/** Turns a room's waiting room on or off. */
export async function toggleLobbyAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const id = String(formData.get('id') ?? '');
  await updateMeetingRoom(id, { lobby: formData.get('lobby') === 'on' }).catch(() => undefined);
  revalidatePath(`/${locale}/meetings`);
}

/** Deletes a room; a meeting going on in it ends. */
export async function deleteRoomAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const id = String(formData.get('id') ?? '');
  await deleteMeetingRoom(id).catch(() => undefined);
  revalidatePath(`/${locale}/meetings`);
}

/** "Join with a code": opens the room's page. */
export async function joinByCodeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Meetings.landing' });
  const raw = String(formData.get('code') ?? '');
  // A pasted link works too: its last part is the code.
  const code = normalizeMeetingCode(raw.split('/').filter(Boolean).at(-1) ?? '');
  if (!code)
    return { status: 'error', fieldErrors: { code: t('codeInvalid') }, values: { code: raw } };
  redirect(`/${locale}/meetings/${code}`);
  return { status: 'success' };
}

/**
 * A single-use ticket into a room, asked for server-side (BFF): with the account when signed in,
 * else as a guest with the name typed.
 */
export async function meetingTicketAction(
  code: string,
  name: string,
): Promise<MeetingTicketResult> {
  const normalized = normalizeMeetingCode(code);
  if (!normalized) return { ok: false, reason: 'not-found' };
  const user = await getCurrentUser();
  try {
    let ticket;
    try {
      ticket = user
        ? await createMeetingTicket(normalized)
        : await createMeetingGuestTicket(normalized, name);
    } catch (error) {
      // A session that ran out meanwhile: join as a guest with the same name.
      if (!user || !isApiError(error) || error.status !== 401) throw error;
      ticket = await createMeetingGuestTicket(normalized, name);
    }
    return { ok: true, ticket: ticket.ticket, iceServers: ticket.iceServers };
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 404) return { ok: false, reason: 'not-found' };
    if (status === 400) return { ok: false, reason: 'name' };
    if (status === 429) return { ok: false, reason: 'rate-limited' };
    return { ok: false, reason: 'error' };
  }
}
