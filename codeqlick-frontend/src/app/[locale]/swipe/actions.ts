'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import {
  blockSwipeMatch,
  deleteSwipePhoto,
  moveSwipePhoto,
  getSwipeDeck,
  listSwipeMessages,
  onboardSwipe,
  reportSwipe,
  requestSwipeTakedown,
  saveSwipeProfile,
  MAX_AGE_FILTER,
  MIN_AGE_FILTER,
  sendSwipeMessage,
  subscribeSwipePush,
  SWIPE_COUNTRIES,
  SWIPE_GENDERS,
  SWIPE_REPORT_REASONS,
  TAKEDOWN_REASONS,
  undoSwipeVote,
  unmatchSwipe,
  unsubscribeSwipePush,
  uploadSwipePhoto,
  uploadSwipeVerification,
  voteSwipe,
  type SwipeCard,
  type SwipeCountry,
  type SwipeGender,
  type SwipeMessage,
  type SwipeReportReason,
} from '@/lib/api/swipe';
import type { FormState } from '@/lib/forms';
import { INTERESTS, MAX_INTERESTS, type Interest } from '@/lib/videochat-interests';

/** The nickname is the account's username: 3–20 of a-z, 0-9, `.` and `_`, letter or digit at both ends. */
const NICKNAME = /^(?!.*\.\.)[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The browser shrinks photos before sending them; anything bigger didn't come from our page. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function gender(value: FormDataEntryValue | null): SwipeGender | null {
  return SWIPE_GENDERS.find((g) => g === value) ?? null;
}

/** A whole number in [min, max] from a form field, or `fallback`. */
function wholeNumber(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const number = Number(String(value ?? '').trim());
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function refresh(locale: AppLocale, page: string): void {
  revalidatePath(`/${locale}/swipe/${page}`);
}

/** Confirms 18+ and the rules (PUT /swipe/me); the page then shows the cards. */
export async function onboardAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Swipe.onboarding' });
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
    await onboardSwipe({ birthDate, acceptTerms: true, termsVersion });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 403) return { status: 'error', message: t('underage'), values };
    if (status === 409) return { status: 'error', message: t('rulesChanged'), values };
    return { status: 'error', message: t('error'), values };
  }
  refresh(locale, 'deck');
  return { status: 'success' };
}

/** Saves the public profile and whose photos to show (PUT /swipe/profile). */
export async function profileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Swipe.profile' });
  const nickname = String(formData.get('nickname') ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const seeking = formData
    .getAll('seeking')
    .map(gender)
    .filter((g): g is SwipeGender => g !== null);
  const interests = [
    ...new Set(
      formData
        .getAll('interests')
        .filter((value): value is Interest =>
          (INTERESTS as readonly FormDataEntryValue[]).includes(value),
        ),
    ),
  ];
  const bio = String(formData.get('bio') ?? '')
    .trim()
    .slice(0, 160);
  const yearText = String(formData.get('birthYear') ?? '').trim();
  const country = SWIPE_COUNTRIES.find((value) => value === formData.get('country')) ?? null;
  const ageMin = wholeNumber(
    formData.get('ageMin'),
    MIN_AGE_FILTER,
    MAX_AGE_FILTER,
    MIN_AGE_FILTER,
  );
  const ageMax = wholeNumber(
    formData.get('ageMax'),
    MIN_AGE_FILTER,
    MAX_AGE_FILTER,
    MAX_AGE_FILTER,
  );
  const ticked = (name: string) => formData.get(name) === 'on';
  const values: Record<string, string> = {
    nickname,
    gender: String(formData.get('gender') ?? ''),
    seeking: seeking.join('\n'),
    interests: interests.join('\n'),
    bio,
    birthYear: yearText,
    country: country ?? '',
    ageMin: String(ageMin),
    ageMax: String(ageMax),
  };
  for (const name of ['sameCountry', 'emailAlerts', 'blurPhotos']) {
    if (ticked(name)) values[name] = 'on';
  }
  if (!NICKNAME.test(nickname)) {
    return { status: 'error', fieldErrors: { nickname: t('nicknameInvalid') }, values };
  }
  const thisYear = new Date().getUTCFullYear();
  const birthYear = yearText ? Number(yearText) : null;
  if (
    birthYear !== null &&
    (!Number.isInteger(birthYear) || birthYear < 1900 || thisYear - birthYear < 18)
  ) {
    return { status: 'error', fieldErrors: { birthYear: t('birthYearInvalid') }, values };
  }
  if (interests.length > MAX_INTERESTS) {
    return {
      status: 'error',
      fieldErrors: { interests: t('interestsTooMany', { max: MAX_INTERESTS }) },
      values,
    };
  }
  try {
    await saveSwipeProfile({
      nickname,
      gender: gender(formData.get('gender')),
      seeking,
      interests,
      bio: bio || null,
      birthYear,
      country: country as SwipeCountry | null,
      ageMin: Math.min(ageMin, ageMax),
      ageMax: Math.max(ageMin, ageMax),
      sameCountry: ticked('sameCountry'),
      emailAlerts: ticked('emailAlerts'),
      blurPhotos: ticked('blurPhotos'),
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 409) {
      return { status: 'error', fieldErrors: { nickname: t('nicknameTaken') }, values };
    }
    if (status === 400 && isApiError(error) && error.fieldErrors.nickname) {
      return { status: 'error', fieldErrors: { nickname: t('nicknameReserved') }, values };
    }
    return { status: 'error', message: t('error'), values };
  }
  refresh(locale, 'photos');
  return { status: 'success', message: t('saved') };
}

export type UploadResult = { ok: true } | { ok: false; message: string };

async function upload(
  locale: AppLocale,
  formData: FormData,
  send: (file: File) => Promise<unknown>,
  fullMessage: 'tooMany' | 'albumFull' = 'tooMany',
): Promise<UploadResult> {
  const t = await getTranslations({ locale, namespace: 'Swipe.upload' });
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: t('noFile') };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: t('tooBig') };
  if (formData.get('consent') !== 'on') return { ok: false, message: t('mustConsent') };
  try {
    await send(file);
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 400) {
      const blocked = isApiError(error) && /removed/i.test(error.detail ?? '');
      return { ok: false, message: blocked ? t('blocked') : t('notImage') };
    }
    if (status === 403) return { ok: false, message: t('notVerified') };
    if (status === 409) return { ok: false, message: t(fullMessage) };
    if (status === 429) return { ok: false, message: t('tooManyToday') };
    return { ok: false, message: t('error') };
  }
  refresh(locale, 'photos');
  return { ok: true };
}

/** Sends the verification photo (the person with a paper showing their nickname and the date). */
export async function uploadVerificationAction(
  locale: AppLocale,
  formData: FormData,
): Promise<UploadResult> {
  return upload(locale, formData, uploadSwipeVerification);
}

/** Sends a photo for review. */
export async function uploadPhotoAction(
  locale: AppLocale,
  formData: FormData,
): Promise<UploadResult> {
  return upload(locale, formData, uploadSwipePhoto);
}

/** Sends a photo for review that goes to the private album (only matches see it). */
export async function uploadAlbumPhotoAction(
  locale: AppLocale,
  formData: FormData,
): Promise<UploadResult> {
  return upload(locale, formData, (file) => uploadSwipePhoto(file, true), 'albumFull');
}

/** Moves one of my photos into (`album`) or out of the private album. */
export async function movePhotoAction(
  locale: AppLocale,
  id: string,
  album: boolean,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Swipe.album' });
  if (!UUID.test(id)) return { status: 'error', message: t('moveError') };
  try {
    await moveSwipePhoto(id, album);
  } catch (error) {
    const full = isApiError(error) && error.status === 409;
    return { status: 'error', message: full ? t(album ? 'full' : 'publicFull') : t('moveError') };
  }
  refresh(locale, 'photos');
  return { status: 'success', message: t(album ? 'moved' : 'madePublic') };
}

export async function deletePhotoAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Swipe.photos' });
  if (!UUID.test(id)) return { status: 'error', message: t('error') };
  try {
    await deleteSwipePhoto(id);
  } catch {
    return { status: 'error', message: t('error') };
  }
  refresh(locale, 'photos');
  return { status: 'success', message: t('deleted') };
}

/** More cards (the deck asks when it is running out). */
export async function deckAction(): Promise<SwipeCard[]> {
  try {
    return await getSwipeDeck();
  } catch {
    return [];
  }
}

export type VoteResult =
  | { ok: true; match: { id: string; nickname: string } | null }
  | { ok: false; noLovesLeft?: boolean };

export async function voteAction(
  photoId: string,
  like: boolean,
  superLike = false,
): Promise<VoteResult> {
  if (!UUID.test(photoId)) return { ok: false };
  try {
    const { match } = await voteSwipe(photoId, like === true, like === true && superLike === true);
    return { ok: true, match };
  } catch (error) {
    return { ok: false, noLovesLeft: isApiError(error) && error.status === 429 };
  }
}

/** Undoes the last swipe; its card comes back to the top of the deck. */
export async function undoAction(): Promise<{ ok: true; card: SwipeCard } | { ok: false }> {
  try {
    return { ok: true, card: (await undoSwipeVote()).card };
  } catch {
    return { ok: false };
  }
}

/** Stores this browser's push subscription (PUT /swipe/push). */
export async function swipePushSubscribeAction(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: 'en' | 'es';
}): Promise<{ ok: boolean }> {
  try {
    await subscribeSwipePush({
      endpoint: String(input.endpoint),
      keys: { p256dh: String(input.keys?.p256dh), auth: String(input.keys?.auth) },
      locale: input.locale === 'es' ? 'es' : 'en',
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Forgets this browser's push subscription (DELETE /swipe/push). */
export async function swipePushUnsubscribeAction(endpoint: string): Promise<{ ok: boolean }> {
  try {
    await unsubscribeSwipePush(String(endpoint));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function reportAction(input: {
  photoId?: string;
  matchId?: string;
  reason: string;
  details?: string;
}): Promise<{ ok: boolean }> {
  const reason = SWIPE_REPORT_REASONS.find((value) => value === input.reason) as
    SwipeReportReason | undefined;
  const photoId = input.photoId && UUID.test(input.photoId) ? input.photoId : undefined;
  const matchId = input.matchId && UUID.test(input.matchId) ? input.matchId : undefined;
  if (!reason || (!photoId && !matchId)) return { ok: false };
  try {
    await reportSwipe({
      photoId,
      matchId,
      reason,
      details:
        String(input.details ?? '')
          .trim()
          .slice(0, 1000) || undefined,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function messagesAction(
  matchId: string,
  after?: string,
): Promise<{ ok: true; items: SwipeMessage[] } | { ok: false; gone: boolean }> {
  if (!UUID.test(matchId)) return { ok: false, gone: true };
  try {
    return { ok: true, items: await listSwipeMessages(matchId, after) };
  } catch (error) {
    return { ok: false, gone: isApiError(error) && error.status === 404 };
  }
}

export async function sendMessageAction(
  matchId: string,
  text: string,
): Promise<{ ok: true; message: SwipeMessage } | { ok: false; contactBlocked?: boolean }> {
  const clean = String(text ?? '').trim();
  if (!UUID.test(matchId) || !clean || clean.length > 1000) return { ok: false };
  try {
    return { ok: true, message: await sendSwipeMessage(matchId, clean) };
  } catch (error) {
    return { ok: false, contactBlocked: isApiError(error) && error.status === 400 };
  }
}

export async function unmatchAction(matchId: string, block: boolean): Promise<{ ok: boolean }> {
  if (!UUID.test(matchId)) return { ok: false };
  try {
    await (block ? blockSwipeMatch(matchId) : unmatchSwipe(matchId));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** A removal request from anyone, signed in or not (POST /swipe/takedown). */
export async function takedownAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Swipe.takedown' });
  const email = String(formData.get('email') ?? '').trim();
  const photoRef = String(formData.get('photoRef') ?? '').trim();
  const reason = TAKEDOWN_REASONS.find((value) => value === formData.get('reason'));
  const details = String(formData.get('details') ?? '').trim();
  const values = { email, photoRef, reason: reason ?? '', details };

  if (!EMAIL.test(email) || email.length > 254) {
    return { status: 'error', fieldErrors: { email: t('emailInvalid') }, values };
  }
  if (!reason) return { status: 'error', fieldErrors: { reason: t('reasonNeeded') }, values };
  if (details.length < 10) {
    return { status: 'error', fieldErrors: { details: t('detailsShort') }, values };
  }
  try {
    await requestSwipeTakedown({
      email,
      photoRef: photoRef.slice(0, 40) || undefined,
      reason,
      details: details.slice(0, 2000),
      locale,
      website: String(formData.get('website') ?? '') || undefined,
    });
  } catch {
    return { status: 'error', message: t('error'), values };
  }
  return { status: 'success', message: t('sent') };
}
