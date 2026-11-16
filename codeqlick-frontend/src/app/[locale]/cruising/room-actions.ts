'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { postCruisingRoomMessage, setCruisingAlbumGrant } from '@/lib/api/cruising-rooms';
import { isApiError } from '@/lib/api/errors';
import { isNickname, normalizeNickname } from '@/lib/cruising';
import {
  isRoomPath,
  ROOM_MESSAGE_MAX,
  roomSendErrorKey,
  type RoomMessage,
  type RoomSendErrorKey,
} from '@/lib/cruising-rooms';
import type { FormState } from '@/lib/forms';

/**
 * Cruising's phase 6 actions (architecture 4.15): the city chat (decision 100) and the private
 * album's grants (decision 99). The browser never calls the API: these do, with the session.
 */

export type RoomSendResult =
  { ok: true; message: RoomMessage } | { ok: false; reason: RoomSendErrorKey };

/** Posts a message in a city's room (POST /cruising/rooms/:country/:city/messages). */
export async function sendRoomMessageAction(
  countryCode: string,
  citySlug: string,
  text: string,
): Promise<RoomSendResult> {
  const clean = String(text ?? '').trim();
  if (!isRoomPath(countryCode, citySlug) || !clean || clean.length > ROOM_MESSAGE_MAX) {
    return { ok: false, reason: 'error' };
  }
  try {
    return {
      ok: true,
      message: await postCruisingRoomMessage(countryCode.toUpperCase(), citySlug, clean),
    };
  } catch (error) {
    return { ok: false, reason: roomSendErrorKey(isApiError(error) ? error.status : 0) };
  }
}

/**
 * Shares my private album with the person of a conversation, or takes it back (PUT · DELETE
 * /cruising/album-grants/:nickname).
 */
export async function albumGrantAction(
  locale: AppLocale,
  nickname: string,
  on: boolean,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.album' });
  const who = normalizeNickname(nickname);
  if (!isNickname(who)) return { status: 'error', message: t('error') };
  try {
    await setCruisingAlbumGrant(who, on);
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 404) return { status: 'error', message: t('gone') };
    if (status === 409) return { status: 'error', message: t('needNickname') };
    return { status: 'error', message: t('error') };
  }
  // The profile, the conversation and /me all show who can see what.
  for (const each of routing.locales) revalidatePath(`/${each}/cruising`, 'layout');
  return { status: 'success', message: t(on ? 'shared' : 'revoked', { nickname: who }) };
}
