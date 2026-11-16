'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { routing, type AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import {
  blockCruisingConversation,
  blockCruisingMember,
  createCruisingCheckIn,
  createCruisingSpot,
  deleteCruisingReview,
  deleteCruisingSpot,
  endCruisingCheckIn,
  leaveCruisingConversation,
  onboardCruising,
  openCruisingConversation,
  reportCruising,
  requestCruisingTakedown,
  saveCruisingReview,
  sendCruisingMessage,
  setCruisingFavorite,
  subscribeCruisingPush,
  unblockCruisingMember,
  unsubscribeCruisingPush,
  updateCruisingProfile,
  updateCruisingSpot,
  type CruisingMessage,
} from '@/lib/api/cruising';
import {
  CRUISING_COUNTRIES,
  isLookingFor,
  isNickname,
  LIMITS,
  normalizeNickname,
  parseCheckInHours,
  parseSpotForm,
  PERSON_REPORT_REASONS,
  REPORT_REASONS,
  REVIEW_REPORT_REASONS,
  spotLinkSlug,
  TAKEDOWN_REASONS,
  toSpotInput,
  type CruisingLookingFor,
  type CruisingReportReason,
} from '@/lib/cruising';
import type { FormState } from '@/lib/forms';
import { appPath } from '@/lib/webapp-request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Everything of Cruising that shows the person's state (their entry, their spots, a spot's page). */
function refreshAll(_locale: AppLocale): void {
  // Both languages: a spot hidden by a report or a removal request disappears from every page at once.
  for (const each of routing.locales) revalidatePath(`/${each}/cruising`, 'layout');
}

/** Confirms 18+, the rules and the consent to special category data (PUT /cruising/me). */
export async function onboardAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Cruising.onboarding' });
  const birthDate = String(formData.get('birthDate') ?? '');
  const termsVersion = String(formData.get('termsVersion') ?? '');
  const values = { birthDate };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) {
    return { status: 'error', fieldErrors: { birthDate: t('invalidDate') }, values };
  }
  if (formData.get('acceptTerms') !== 'on') {
    return { status: 'error', fieldErrors: { acceptTerms: t('mustAccept') }, values };
  }
  if (formData.get('consentSpecialData') !== 'on') {
    return { status: 'error', fieldErrors: { consentSpecialData: t('mustConsent') }, values };
  }
  try {
    await onboardCruising({
      birthDate,
      acceptTerms: true,
      consentSpecialData: true,
      termsVersion,
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 403) return { status: 'error', message: t('underage'), values };
    if (status === 409) return { status: 'error', message: t('rulesChanged'), values };
    return { status: 'error', message: t('error'), values };
  }
  refreshAll(locale);
  return { status: 'success' };
}

type SpotFormT = Awaited<ReturnType<typeof spotFormTranslations>>;

async function spotFormTranslations(locale: AppLocale) {
  return getTranslations({ locale, namespace: 'Cruising.spotForm' });
}

/** The form's own errors in the person's language, keyed by field. */
function spotFieldErrors(
  t: SpotFormT,
  errors: ReturnType<typeof parseSpotForm>['errors'],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).map(([field, key]) => [field, t(`errors.${key!}`)]),
  );
}

/** What went wrong in a save the API refused. */
function spotApiMessage(t: SpotFormT, error: unknown): string {
  const status = isApiError(error) ? error.status : 0;
  if (status === 403) return t('notAllowed');
  if (status === 429) return t('tooManyToday');
  if (status === 409) return t('notEditable');
  return t('error');
}

/** Turns the optional emails on or off: spot published and, in phase 2, unread messages. */
export async function emailAlertsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.mySpots' });
  try {
    await updateCruisingProfile({ emailAlerts: formData.get('emailAlerts') === 'on' });
  } catch {
    return { status: 'error', message: t('alertsError') };
  }
  refreshAll(locale);
  return { status: 'success', message: t('alertsSaved') };
}

/** Proposes a spot (POST /cruising/spots): it waits for the team's review. */
export async function createSpotAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await spotFormTranslations(locale);
  const { values, errors, data } = parseSpotForm(formData);
  if (Object.keys(errors).length > 0) {
    return { status: 'error', fieldErrors: spotFieldErrors(t, errors), values };
  }
  const proposal = toSpotInput(data);
  if (!proposal) return { status: 'error', message: t('error'), values };
  try {
    await createCruisingSpot(proposal);
  } catch (error) {
    return { status: 'error', message: spotApiMessage(t, error), values };
  }
  refreshAll(locale);
  redirect(await appPath(`/${locale}/cruising/my-spots?sent=1`, locale));
}

/** Edits one of my PENDING or REJECTED spots (PATCH /cruising/spots/:id). */
export async function updateSpotAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await spotFormTranslations(locale);
  if (!UUID.test(id)) return { status: 'error', message: t('error') };
  // The list the API gave may not carry every field: an empty one is left as it is.
  const { values, errors, data } = parseSpotForm(formData, true);
  if (Object.keys(errors).length > 0) {
    return { status: 'error', fieldErrors: spotFieldErrors(t, errors), values };
  }
  if (Object.keys(data).length === 0) {
    return { status: 'error', message: t('nothingToSave'), values };
  }
  try {
    await updateCruisingSpot(id, data);
  } catch (error) {
    return { status: 'error', message: spotApiMessage(t, error), values };
  }
  refreshAll(locale);
  redirect(await appPath(`/${locale}/cruising/my-spots?saved=1`, locale));
}

/** Deletes one of my PENDING or REJECTED spots (DELETE /cruising/spots/:id). */
export async function deleteSpotAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.mySpots' });
  if (!UUID.test(id)) return { status: 'error', message: t('deleteError') };
  try {
    await deleteCruisingSpot(id);
  } catch (error) {
    const gone = isApiError(error) && error.status === 409;
    return { status: 'error', message: gone ? t('notDeletable') : t('deleteError') };
  }
  refreshAll(locale);
  return { status: 'success', message: t('deleted') };
}

/** Writes or replaces my review of a spot (PUT /cruising/spots/:id/review). */
export async function reviewAction(
  locale: AppLocale,
  spotId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.reviews' });
  const rating = Number(formData.get('rating'));
  const text = String(formData.get('text') ?? '').trim();
  const values = { rating: String(formData.get('rating') ?? ''), text };
  if (!UUID.test(spotId)) return { status: 'error', message: t('error'), values };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: 'error', fieldErrors: { rating: t('ratingNeeded') }, values };
  }
  if (text.length > LIMITS.review) {
    return { status: 'error', fieldErrors: { text: t('textLong') }, values };
  }
  try {
    await saveCruisingReview(spotId, { rating, text: text || undefined });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 400) {
      return { status: 'error', fieldErrors: { text: t('contactBlocked') }, values };
    }
    if (status === 403) return { status: 'error', message: t('notAllowed'), values };
    if (status === 404) return { status: 'error', message: t('gone'), values };
    if (status === 429) return { status: 'error', message: t('tooManyToday'), values };
    return { status: 'error', message: t('error'), values };
  }
  refreshAll(locale);
  return { status: 'success', message: t('saved') };
}

/** Deletes my review (DELETE /cruising/spots/:id/review). */
export async function deleteReviewAction(
  locale: AppLocale,
  spotId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.reviews' });
  if (!UUID.test(spotId)) return { status: 'error', message: t('error') };
  try {
    await deleteCruisingReview(spotId);
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll(locale);
  return { status: 'success', message: t('deleted') };
}

/**
 * Reports a spot or a review. A "correction" is a report of a spot for WRONG_INFO, which needs the
 * details: what is wrong and what it should say.
 */
export async function reportAction(
  locale: AppLocale,
  target: { kind: 'spot' | 'review' | 'correction' | 'profile' | 'conversation'; id: string },
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.report' });
  const details = String(formData.get('details') ?? '')
    .trim()
    .slice(0, LIMITS.details);
  const allowed: readonly CruisingReportReason[] =
    target.kind === 'review'
      ? REVIEW_REPORT_REASONS
      : target.kind === 'profile' || target.kind === 'conversation'
        ? PERSON_REPORT_REASONS
        : REPORT_REASONS;
  const reason: CruisingReportReason | undefined =
    target.kind === 'correction'
      ? 'WRONG_INFO'
      : allowed.find((value) => value === formData.get('reason'));
  const values = { reason: reason ?? '', details };
  const validTarget = target.kind === 'profile' ? isNickname(target.id) : UUID.test(target.id);
  if (!validTarget) return { status: 'error', message: t('error'), values };
  if (!reason) return { status: 'error', fieldErrors: { reason: t('reasonNeeded') }, values };
  if (reason === 'WRONG_INFO' && details.length < 10) {
    return { status: 'error', fieldErrors: { details: t('detailsNeeded') }, values };
  }
  try {
    await reportCruising({
      ...(target.kind === 'review'
        ? { reviewId: target.id }
        : target.kind === 'profile'
          ? { nickname: target.id }
          : target.kind === 'conversation'
            ? { conversationId: target.id }
            : { spotId: target.id }),
      reason,
      details: details || undefined,
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 429) return { status: 'error', message: t('tooManyToday'), values };
    if (status === 403) return { status: 'error', message: t('notAllowed'), values };
    return { status: 'error', message: t('error'), values };
  }
  refreshAll(locale);
  return {
    status: 'success',
    message: t(target.kind === 'correction' ? 'correctionSent' : 'sent'),
  };
}

/** A removal request from anyone, signed in or not (POST /cruising/takedown). */
export async function takedownAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Cruising.takedown' });
  const email = String(formData.get('email') ?? '').trim();
  const spotLink = String(formData.get('spotLink') ?? '').trim();
  const reason = TAKEDOWN_REASONS.find((value) => value === formData.get('reason'));
  const details = String(formData.get('details') ?? '').trim();
  const values = { email, spotLink, reason: reason ?? '', details };

  if (!EMAIL.test(email) || email.length > 254) {
    return { status: 'error', fieldErrors: { email: t('emailInvalid') }, values };
  }
  if (spotLink && !spotLinkSlug(spotLink)) {
    return { status: 'error', fieldErrors: { spotLink: t('linkInvalid') }, values };
  }
  if (!reason) return { status: 'error', fieldErrors: { reason: t('reasonNeeded') }, values };
  if (details.length < 10) {
    return { status: 'error', fieldErrors: { details: t('detailsShort') }, values };
  }
  try {
    await requestCruisingTakedown({
      email,
      spotLink: spotLink.slice(0, 300) || undefined,
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

// ---- Phase 2: profile, check-ins, blocks and messages ------------------------------------------

/** Saves my profile (PATCH /cruising/profile). The nickname is sent only while I have none. */
export async function profileAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.me' });
  const nickname = normalizeNickname(String(formData.get('nickname') ?? ''));
  const bio = String(formData.get('bio') ?? '').trim();
  const countryValue = String(formData.get('country') ?? '');
  const lookingFor: CruisingLookingFor[] = formData.getAll('lookingFor').filter(isLookingFor);
  const showAge = formData.get('showAge') === 'on';
  const values: Record<string, string> = {
    nickname,
    bio,
    country: countryValue,
    lookingFor: lookingFor.join('\n'),
    ...(showAge ? { showAge: 'on' } : {}),
  };

  if (!isNickname(nickname)) {
    return { status: 'error', fieldErrors: { nickname: t('nicknameInvalid') }, values };
  }
  if (bio.length > LIMITS.bio) {
    return { status: 'error', fieldErrors: { bio: t('bioLong') }, values };
  }
  const country = CRUISING_COUNTRIES.find((code) => code === countryValue) ?? null;
  if (countryValue && !country) {
    return { status: 'error', fieldErrors: { country: t('countryInvalid') }, values };
  }
  try {
    await updateCruisingProfile({
      // Unchanged, the API leaves it as it is; changed, the old one stays mine for 14 days.
      nickname,
      bio,
      country,
      lookingFor,
      showAge,
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 409) {
      return { status: 'error', fieldErrors: { nickname: t('nicknameTaken') }, values };
    }
    // A refused bio (contact details) is a 400 too: the API's message says which.
    if (status === 400 && /bio/i.test(isApiError(error) ? error.message : '')) {
      return { status: 'error', fieldErrors: { bio: t('bioContact') }, values };
    }
    if (status === 400) {
      return { status: 'error', fieldErrors: { nickname: t('nicknameRefused') }, values };
    }
    if (status === 403) return { status: 'error', message: t('notAllowed'), values };
    return { status: 'error', message: t('error'), values };
  }
  refreshAll(locale);
  return { status: 'success', message: t('saved') };
}

/** "I'm here" at a spot (POST /cruising/check-ins): it ends my previous check-in. */
export async function checkInAction(
  locale: AppLocale,
  spotId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.presence' });
  const hours = parseCheckInHours(formData.get('hours'));
  if (!UUID.test(spotId) || !hours) return { status: 'error', message: t('error') };
  try {
    await createCruisingCheckIn({ spotId, hours, anonymous: formData.get('anonymous') === 'on' });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 409) return { status: 'error', message: t('needNickname') };
    if (status === 404) return { status: 'error', message: t('gone') };
    if (status === 429) return { status: 'error', message: t('tooManyToday') };
    if (status === 403) return { status: 'error', message: t('notAllowed') };
    return { status: 'error', message: t('error') };
  }
  refreshAll(locale);
  return { status: 'success', message: t('checkedIn') };
}

/** Ends my check-in (DELETE /cruising/check-in). */
export async function endCheckInAction(
  locale: AppLocale,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.presence' });
  try {
    await endCruisingCheckIn();
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll(locale);
  return { status: 'success', message: t('ended') };
}

/** Opens (or returns) the conversation with a member and goes to it. */
export async function startConversationAction(
  locale: AppLocale,
  nickname: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.members' });
  if (!isNickname(nickname)) return { status: 'error', message: t('error') };
  const opened = await openCruisingConversation(nickname).then(
    (conversation) => ({ id: conversation.id }) as const,
    (error: unknown) => ({ status: isApiError(error) ? error.status : 0 }) as const,
  );
  if ('status' in opened) {
    if (opened.status === 409) redirect(await appPath(`/${locale}/cruising/me`, locale));
    if (opened.status === 404) return { status: 'error', message: t('notFound') };
    if (opened.status === 429) return { status: 'error', message: t('tooManyConversations') };
    if (opened.status === 403) return { status: 'error', message: t('notAllowed') };
    return { status: 'error', message: t('error') };
  }
  redirect(await appPath(`/${locale}/cruising/messages/${opened.id}`, locale));
}

/** Blocks a member both ways and deletes the conversation with them. */
export async function blockMemberAction(
  locale: AppLocale,
  nickname: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.members' });
  if (!isNickname(nickname)) return { status: 'error', message: t('error') };
  try {
    await blockCruisingMember(nickname);
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll(locale);
  redirect(await appPath(`/${locale}/cruising/me?blocked=1`, locale));
}

/** Lifts one of my blocks. */
export async function unblockAction(
  locale: AppLocale,
  nickname: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.me' });
  if (!isNickname(nickname)) return { status: 'error', message: t('error') };
  try {
    await unblockCruisingMember(nickname);
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll(locale);
  return { status: 'success', message: t('unblocked') };
}

export type SendMessageResult =
  | { ok: true; message: CruisingMessage }
  | { ok: false; reason: 'contact' | 'rate' | 'gone' | 'error' };

/** Sends a message in a conversation (POST /cruising/conversations/:id/messages). */
export async function sendMessageAction(
  conversationId: string,
  text: string,
): Promise<SendMessageResult> {
  const clean = String(text ?? '').trim();
  if (!UUID.test(conversationId) || !clean || clean.length > LIMITS.message) {
    return { ok: false, reason: 'error' };
  }
  try {
    return { ok: true, message: await sendCruisingMessage(conversationId, clean) };
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 400) return { ok: false, reason: 'contact' };
    if (status === 429) return { ok: false, reason: 'rate' };
    if (status === 404) return { ok: false, reason: 'gone' };
    return { ok: false, reason: 'error' };
  }
}

/** Leaves a conversation (it is deleted for both) or blocks the person (also deleting it). */
async function endConversation(
  locale: AppLocale,
  conversationId: string,
  block: boolean,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.messages' });
  if (!UUID.test(conversationId)) return { status: 'error', message: t('error') };
  try {
    await (block
      ? blockCruisingConversation(conversationId)
      : leaveCruisingConversation(conversationId));
  } catch (error) {
    if (!(isApiError(error) && error.status === 404)) {
      return { status: 'error', message: t('error') };
    }
  }
  refreshAll(locale);
  redirect(await appPath(`/${locale}/cruising/messages?${block ? 'blocked' : 'left'}=1`, locale));
}

export async function leaveConversationAction(
  locale: AppLocale,
  conversationId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  return endConversation(locale, conversationId, false);
}

export async function blockConversationAction(
  locale: AppLocale,
  conversationId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  return endConversation(locale, conversationId, true);
}

// ---- Favourites and notifications (phase 3, decision 85) ---------------------------------------

/** Saves a spot as a favourite or removes it (PUT · DELETE /cruising/favorites/:spotId). */
export async function favoriteAction(
  locale: AppLocale,
  spotId: string,
  on: boolean,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.favorites' });
  if (!UUID.test(spotId)) return { status: 'error', message: t('error') };
  try {
    await setCruisingFavorite(spotId, on);
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 409) return { status: 'error', message: t('full') };
    if (status === 404) return { status: 'error', message: t('gone') };
    if (status === 403) return { status: 'error', message: t('notAllowed') };
    return { status: 'error', message: t('error') };
  }
  refreshAll(locale);
  return { status: 'success', message: on ? t('added') : t('removed') };
}

/** Alerts for favourite spots: push on (default) and the daily email (default off). */
export async function favoriteSettingsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.meFavorites' });
  try {
    await updateCruisingProfile({
      favoriteAlerts: formData.get('favoriteAlerts') === 'on',
      favoriteEmails: formData.get('favoriteEmails') === 'on',
    });
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll(locale);
  return { status: 'success', message: t('saved') };
}

/** Stores this device's push subscription (PUT /cruising/push); the language is the account's. */
export async function cruisingPushSubscribeAction(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: 'en' | 'es';
}): Promise<{ ok: boolean }> {
  try {
    await subscribeCruisingPush({
      endpoint: String(input.endpoint),
      keys: { p256dh: String(input.keys?.p256dh), auth: String(input.keys?.auth) },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Forgets this device's push subscription (DELETE /cruising/push). */
export async function cruisingPushUnsubscribeAction(endpoint: string): Promise<{ ok: boolean }> {
  try {
    await unsubscribeCruisingPush(String(endpoint));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
