'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { routing, type AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import {
  createCruisingSpot,
  deleteCruisingReview,
  deleteCruisingSpot,
  onboardCruising,
  reportCruising,
  requestCruisingTakedown,
  saveCruisingReview,
  updateCruisingProfile,
  updateCruisingSpot,
} from '@/lib/api/cruising';
import {
  LIMITS,
  parseSpotForm,
  REPORT_REASONS,
  REVIEW_REPORT_REASONS,
  spotLinkSlug,
  TAKEDOWN_REASONS,
  toSpotInput,
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
  target: { kind: 'spot' | 'review' | 'correction'; id: string },
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.report' });
  const details = String(formData.get('details') ?? '')
    .trim()
    .slice(0, LIMITS.details);
  const allowed: readonly CruisingReportReason[] =
    target.kind === 'review' ? REVIEW_REPORT_REASONS : REPORT_REASONS;
  const reason: CruisingReportReason | undefined =
    target.kind === 'correction'
      ? 'WRONG_INFO'
      : allowed.find((value) => value === formData.get('reason'));
  const values = { reason: reason ?? '', details };
  if (!UUID.test(target.id)) return { status: 'error', message: t('error'), values };
  if (!reason) return { status: 'error', fieldErrors: { reason: t('reasonNeeded') }, values };
  if (reason === 'WRONG_INFO' && details.length < 10) {
    return { status: 'error', fieldErrors: { details: t('detailsNeeded') }, values };
  }
  try {
    await reportCruising({
      ...(target.kind === 'review' ? { reviewId: target.id } : { spotId: target.id }),
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
