'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import {
  acceptCloudInvite,
  addCloudDomain,
  checkCloudDomain,
  createCloudForm,
  createCloudProject,
  createCloudTeam,
  createCloudToken,
  decideCloudDevice,
  deleteCloudDeployment,
  deleteCloudForm,
  deleteCloudProject,
  deleteCloudSubmission,
  deleteCloudTeam,
  inviteCloudMember,
  promoteCloudDeployment,
  removeCloudDomain,
  removeCloudMember,
  replaceCloudFormKey,
  renameCloudProject,
  renameCloudTeam,
  reportCloudPage,
  revokeCloudInvite,
  revokeCloudToken,
  setCloudMemberRole,
  updateCloudForm,
  type CloudReportReason,
  type CloudRole,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formBoolean, formString, formValues, type FormState } from '@/lib/forms';
import { appPath } from '@/lib/webapp-request';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The console's paths, as the short address on cloud.codeqlick.com. */
async function go(locale: string, path: string): Promise<never> {
  redirect(await appPath(`/${locale}/cloud${path}`, locale));
}

const refresh = (locale: string, path = '') => revalidatePath(`/${locale}/cloud/console${path}`);

/** A failed API call as the form's message: permission, limits, not found, or generic. */
async function failure(
  locale: AppLocale,
  error: unknown,
  values?: Record<string, string>,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cloud.common' });
  if (isApiError(error)) {
    if (error.status === 403) return { status: 'error', message: t('noPermission'), values };
    if (error.status === 404) return { status: 'error', message: t('notFound'), values };
    if (error.status === 409 || error.status === 429) {
      return { status: 'error', message: error.detail ?? t('tooMany'), values };
    }
    if (error.status === 400 && error.detail)
      return { status: 'error', message: error.detail, values };
  }
  return { status: 'error', message: t('failed'), values };
}

// ── Teams ─────────────────────────────────────────────────────────────────────────────────────

export async function createTeamAction(
  locale: string,
  termsVersion: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.console' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  const slug = formString(formData, 'slug').toLowerCase();
  const fieldErrors: Record<string, string> = {};
  if (name.length < 1 || name.length > 60) fieldErrors.name = t('invalid');
  if (slug.length < 3 || slug.length > 30 || !SLUG.test(slug)) fieldErrors.slug = t('slugHint');
  if (!formBoolean(formData, 'terms')) fieldErrors.terms = t('terms');
  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: t('invalid'), fieldErrors, values };
  }
  try {
    await createCloudTeam({ name, slug, acceptTerms: true, termsVersion });
  } catch (error) {
    if (isApiError(error) && error.status === 409 && /address/i.test(error.message)) {
      return { status: 'error', fieldErrors: { slug: t('slugTaken') }, values };
    }
    if (isApiError(error) && error.status === 409 && /terms/i.test(error.message)) {
      return { status: 'error', message: t('termsChanged'), values };
    }
    return failure(lang, error, values);
  }
  refresh(lang);
  return go(lang, `/console/${slug}`);
}

export async function renameTeamAction(
  locale: string,
  team: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.team' });
  const name = formString(formData, 'name');
  if (name.length < 1 || name.length > 60) return { status: 'error', values: formValues(formData) };
  try {
    await renameCloudTeam(team, name);
  } catch (error) {
    return failure(lang, error);
  }
  refresh(lang, `/${team}`);
  return { status: 'success', message: t('renamed') };
}

export async function deleteTeamAction(
  locale: string,
  team: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  if (formString(formData, 'confirm') !== team) {
    const t = await getTranslations({ locale: lang, namespace: 'Common' });
    return { status: 'error', fieldErrors: { confirm: t('confirmType', { text: team }) } };
  }
  try {
    await deleteCloudTeam(team);
  } catch (error) {
    return failure(lang, error);
  }
  refresh(lang);
  return go(lang, '/console');
}

// ── Members ───────────────────────────────────────────────────────────────────────────────────

export async function inviteAction(
  locale: string,
  team: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.members' });
  const values = formValues(formData);
  const email = formString(formData, 'email').toLowerCase();
  const role = formString(formData, 'role') === 'ADMIN' ? 'ADMIN' : 'MEMBER';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const tv = await getTranslations({ locale: lang, namespace: 'Validation' });
    return { status: 'error', fieldErrors: { email: tv('email') }, values };
  }
  try {
    await inviteCloudMember(team, { email, role, locale: lang });
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      return { status: 'error', message: t('already'), values };
    }
    return failure(lang, error, values);
  }
  refresh(lang, `/${team}/members`);
  return { status: 'success', message: t('sent') };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  await revokeCloudInvite(team, formString(formData, 'id')).catch(() => undefined);
  refresh(locale, `/${team}/members`);
}

export async function setRoleAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  const role = formString(formData, 'role') as CloudRole;
  if (['OWNER', 'ADMIN', 'MEMBER'].includes(role)) {
    await setCloudMemberRole(team, formString(formData, 'userId'), role).catch(() => undefined);
  }
  refresh(locale, `/${team}/members`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  const self = formBoolean(formData, 'self');
  await removeCloudMember(team, formString(formData, 'userId')).catch(() => undefined);
  if (self) {
    refresh(locale);
    await go(locale, '/console');
  }
  refresh(locale, `/${team}/members`);
}

export async function acceptInviteAction(
  locale: string,
  token: string,
  termsVersion: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  if (!formBoolean(formData, 'terms')) {
    const t = await getTranslations({ locale: lang, namespace: 'Cloud.console' });
    return { status: 'error', fieldErrors: { terms: t('terms') } };
  }
  let team: string;
  try {
    team = (await acceptCloudInvite(token, termsVersion)).team.slug;
  } catch (error) {
    return failure(lang, error);
  }
  refresh(lang);
  return go(lang, `/console/${team}`);
}

// ── Projects ──────────────────────────────────────────────────────────────────────────────────

export async function createProjectAction(
  locale: string,
  team: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.team' });
  const tc = await getTranslations({ locale: lang, namespace: 'Cloud.console' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  const slug = formString(formData, 'slug').toLowerCase();
  const fieldErrors: Record<string, string> = {};
  if (name.length < 1 || name.length > 60) fieldErrors.name = tc('invalid');
  if (slug.length < 3 || slug.length > 40 || !SLUG.test(slug)) fieldErrors.slug = tc('invalid');
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors, values };
  try {
    await createCloudProject(team, { name, slug });
  } catch (error) {
    if (isApiError(error) && error.status === 409 && /address/i.test(error.message)) {
      return { status: 'error', fieldErrors: { slug: t('slugTaken') }, values };
    }
    return failure(lang, error, values);
  }
  refresh(lang, `/${team}`);
  return go(lang, `/console/${team}/${slug}`);
}

export async function renameProjectAction(
  locale: string,
  path: string,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.project' });
  const name = formString(formData, 'name');
  if (name.length < 1 || name.length > 60) return { status: 'error', values: formValues(formData) };
  try {
    await renameCloudProject(id, name);
  } catch (error) {
    return failure(lang, error);
  }
  refresh(lang, path);
  return { status: 'success', message: t('saved') };
}

export async function deleteProjectAction(
  locale: string,
  team: string,
  id: string,
  slug: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  if (formString(formData, 'confirm') !== slug) {
    const t = await getTranslations({ locale: lang, namespace: 'Common' });
    return { status: 'error', fieldErrors: { confirm: t('confirmType', { text: slug }) } };
  }
  try {
    await deleteCloudProject(id);
  } catch (error) {
    return failure(lang, error);
  }
  refresh(lang, `/${team}`);
  return go(lang, `/console/${team}`);
}

export async function promoteAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await promoteCloudDeployment(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

export async function deleteDeploymentAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudDeployment(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

// ── Domains ───────────────────────────────────────────────────────────────────────────────────

export async function addDomainAction(
  locale: string,
  path: string,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.project' });
  const values = formValues(formData);
  const name = formString(formData, 'name').toLowerCase().replace(/\.+$/, '');
  if (!DOMAIN.test(name) || name.length > 253) {
    const tv = await getTranslations({ locale: lang, namespace: 'Validation' });
    return { status: 'error', fieldErrors: { name: tv('domain') }, values };
  }
  try {
    await addCloudDomain(id, name);
  } catch (error) {
    if (isApiError(error) && error.status === 400) {
      return { status: 'error', fieldErrors: { name: t('domainNotAllowed') }, values };
    }
    if (isApiError(error) && error.status === 409) {
      return { status: 'error', fieldErrors: { name: t('domainTaken') }, values };
    }
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return { status: 'success' };
}

export async function checkDomainAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await checkCloudDomain(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

export async function removeDomainAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await removeCloudDomain(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

// ── Tokens ────────────────────────────────────────────────────────────────────────────────────

/** Creates a token; the secret goes back once in the form's values (`token`) to be copied. */
export async function createTokenAction(
  locale: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.tokens' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  if (name.length < 1 || name.length > 80) {
    const tv = await getTranslations({ locale: lang, namespace: 'Validation' });
    return { status: 'error', fieldErrors: { name: tv('required') }, values };
  }
  const team = formString(formData, 'team');
  const expiry = formString(formData, 'expiry');
  const expiresInDays =
    expiry === '30' ? 30 : expiry === '365' ? 365 : expiry === 'never' ? null : 90;
  let token: string;
  try {
    token = (await createCloudToken({ name, teamSlug: team || undefined, expiresInDays })).token;
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      return { status: 'error', message: t('tooMany'), values };
    }
    return failure(lang, error, values);
  }
  refresh(lang, '/tokens');
  return { status: 'success', message: t('newToken'), values: { token } };
}

export async function revokeTokenAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await revokeCloudToken(formString(formData, 'id')).catch(() => undefined);
  refresh(locale, '/tokens');
}

// ── CLI sign-in ───────────────────────────────────────────────────────────────────────────────

export async function decideDeviceAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const code = formString(formData, 'code');
  const approve = formString(formData, 'decision') === 'approve';
  let outcome = approve ? 'approved' : 'denied';
  await decideCloudDevice(code, approve).catch(() => {
    outcome = 'expired';
  });
  await go(locale, `/cli?code=${encodeURIComponent(code)}&done=${outcome}`);
}

// ── Abuse reports ─────────────────────────────────────────────────────────────────────────────

const REASONS: readonly CloudReportReason[] = [
  'PHISHING',
  'MALWARE',
  'ILLEGAL',
  'COPYRIGHT',
  'SEXUAL',
  'SPAM',
  'OTHER',
];

export async function reportAction(
  locale: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.report' });
  const tv = await getTranslations({ locale: lang, namespace: 'Validation' });
  const values = formValues(formData);
  const url = formString(formData, 'url');
  const reason = formString(formData, 'reason') as CloudReportReason;
  const details = formString(formData, 'details');
  const email = formString(formData, 'email');
  const fieldErrors: Record<string, string> = {};
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('protocol');
  } catch {
    fieldErrors.url = tv('url');
  }
  if (!REASONS.includes(reason)) fieldErrors.reason = tv('choice');
  if (details.length < 10 || details.length > 2000) fieldErrors.details = t('detailsHint');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = tv('email');
  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: t('invalid'), fieldErrors, values };
  }
  try {
    await reportCloudPage({
      url,
      reason,
      details,
      email,
      website: formString(formData, 'website'),
    });
  } catch (error) {
    return failure(lang, error, values);
  }
  return { status: 'success', message: t('sent') };
}

// ── Forms (phase 1b) ──────────────────────────────────────────────────────────────────────────

export async function createFormAction(
  locale: string,
  path: string,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.forms' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  const recipientIds = formData.getAll('recipients').map(String).filter(Boolean);
  const fieldErrors: Record<string, string> = {};
  if (name.length < 1 || name.length > 60) fieldErrors.name = t('nameInvalid');
  if (recipientIds.length < 1 || recipientIds.length > 5)
    fieldErrors.recipients = t('recipientsInvalid');
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors, values };
  try {
    await createCloudForm(projectId, {
      name,
      notify: formBoolean(formData, 'notify'),
      recipientIds,
    });
  } catch (error) {
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return { status: 'success', message: t('created') };
}

export async function toggleFormAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await updateCloudForm(formString(formData, 'project'), formString(formData, 'id'), {
    enabled: formString(formData, 'enabled') === 'on',
  }).catch(() => undefined);
  refresh(locale, formString(formData, 'path'));
}

export async function replaceFormKeyAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await replaceCloudFormKey(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

export async function deleteFormAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudForm(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

export async function deleteSubmissionAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudSubmission(
    formString(formData, 'project'),
    formString(formData, 'form'),
    formString(formData, 'id'),
  ).catch(() => undefined);
  refresh(locale, formString(formData, 'path'));
}
