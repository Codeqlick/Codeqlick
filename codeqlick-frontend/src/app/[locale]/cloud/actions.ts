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
  createCloudMonitor,
  createCloudNotification,
  createCloudBucket,
  createCloudBucketKey,
  deleteCloudBucket,
  deleteCloudBucketKey,
  createCloudDatabase,
  deleteCloudDatabase,
  resetCloudDatabase,
  cloudBillingLink,
  deleteCloudKv,
  putCloudKv,
  setCloudAnalytics,
  deleteCloudNotification,
  testCloudNotification,
  updateCloudNotification,
  type CloudNotifyKind,
  createCloudProject,
  createCloudTeam,
  createCloudToken,
  decideCloudDevice,
  deleteCloudDeployment,
  keepCloudDeployment,
  deleteCloudForm,
  deleteCloudMonitor,
  deleteCloudProject,
  deleteCloudSubmission,
  deleteCloudTeam,
  inviteCloudMember,
  promoteCloudDeployment,
  unkeepCloudDeployment,
  removeCloudDomain,
  removeCloudMember,
  replaceCloudFormKey,
  renameCloudProject,
  renameCloudTeam,
  reportCloudPage,
  revokeCloudInvite,
  revokeCloudToken,
  runCloudAudit,
  saveCloudStatusPage,
  setCloudMemberRole,
  updateCloudForm,
  updateCloudMonitor,
  type CloudReportReason,
  type CloudRole,
  cancelCloudBuild,
  deleteCloudEnv,
  disconnectCloudGit,
  getCloudGithubInstallUrl,
  setCloudEnv,
  setCloudGit,
  startCloudBuild,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formBoolean, formString, formValues, initialFormState, type FormState } from '@/lib/forms';
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

export async function keepDeploymentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  try {
    await keepCloudDeployment(formString(formData, 'project'), formString(formData, 'id'));
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      const t = await getTranslations({ locale, namespace: 'Cloud' });
      return { status: 'error', message: t('project.keptFull') };
    }
    return failure(locale, error);
  }
  refresh(locale, formString(formData, 'path'));
  return initialFormState;
}

export async function unkeepDeploymentAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await unkeepCloudDeployment(formString(formData, 'project'), formString(formData, 'id')).catch(
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

// ── Monitors and status page (phase 1b) ───────────────────────────────────────────────────────

export async function createMonitorAction(
  locale: string,
  team: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.monitors' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  const kind = formString(formData, 'kind') === 'HEARTBEAT' ? 'HEARTBEAT' : 'HTTP';
  const alertIds = formData.getAll('alerts').map(String).filter(Boolean);
  const fieldErrors: Record<string, string> = {};
  if (name.length < 1 || name.length > 60) fieldErrors.name = t('nameInvalid');
  if (alertIds.length < 1 || alertIds.length > 10) fieldErrors.alerts = t('alertsInvalid');
  const url = formString(formData, 'url');
  const period = Math.round(Number(formString(formData, 'period')));
  const grace = Math.round(Number(formString(formData, 'grace')));
  if (kind === 'HTTP' && !/^https?:\/\/\S+$/i.test(url)) fieldErrors.url = t('urlInvalid');
  if (kind === 'HEARTBEAT' && !(period >= 1 && period <= 10080))
    fieldErrors.period = t('periodInvalid');
  if (kind === 'HEARTBEAT' && !(grace >= 1 && grace <= 1440)) fieldErrors.grace = t('graceInvalid');
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors, values };
  let id: string;
  try {
    id = (
      await createCloudMonitor(
        team,
        kind === 'HTTP'
          ? { kind, name, url, alertIds }
          : { kind, name, periodMinutes: period, graceMinutes: grace, alertIds },
      )
    ).id;
  } catch (error) {
    if (isApiError(error) && error.status === 400 && kind === 'HTTP') {
      return { status: 'error', fieldErrors: { url: t('urlUnsafe') }, values };
    }
    return failure(lang, error, values);
  }
  refresh(lang, `/${team}/monitors`);
  return go(lang, `/console/${team}/monitors/${id}`);
}

export async function toggleMonitorAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  const id = formString(formData, 'id');
  await updateCloudMonitor(id, { enabled: formString(formData, 'enabled') === 'on' }).catch(
    () => undefined,
  );
  refresh(locale, `/${team}/monitors/${id}`);
}

export async function deleteMonitorAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  await deleteCloudMonitor(formString(formData, 'id')).catch(() => undefined);
  refresh(locale, `/${team}/monitors`);
  await go(locale, `/console/${team}/monitors`);
}

export async function saveStatusPageAction(
  locale: string,
  team: string,
  monitorIds: string[],
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.statusPage' });
  const title = formString(formData, 'title');
  if (title.length < 1 || title.length > 80) {
    return {
      status: 'error',
      fieldErrors: { title: t('titleInvalid') },
      values: formValues(formData),
    };
  }
  const items = monitorIds
    .filter((id) => formBoolean(formData, `show.${id}`))
    .map((id) => ({
      monitorId: id,
      label: (formString(formData, `label.${id}`) || id).slice(0, 60),
    }));
  try {
    await saveCloudStatusPage(team, {
      enabled: formBoolean(formData, 'enabled'),
      title,
      intro: formString(formData, 'intro').slice(0, 500) || null,
      items,
    });
  } catch (error) {
    return failure(lang, error, formValues(formData));
  }
  refresh(lang, `/${team}/status-page`);
  revalidatePath(`/${lang}/cloud/status/${team}`);
  return { status: 'success', message: t('saved') };
}

// ── Website check (phase 1b) ──────────────────────────────────────────────────────────────────

export async function runAuditAction(
  locale: string,
  team: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.audits' });
  const values = formValues(formData);
  const url = formString(formData, 'url');
  if (!/^https?:\/\/\S+$/i.test(url))
    return { status: 'error', fieldErrors: { url: t('urlInvalid') }, values };
  let id: string;
  try {
    id = (await runCloudAudit({ url, teamSlug: team, locale: lang })).id;
  } catch (error) {
    if (isApiError(error) && (error.status === 400 || error.status === 422)) {
      return { status: 'error', fieldErrors: { url: error.detail ?? t('urlInvalid') }, values };
    }
    return failure(lang, error, values);
  }
  refresh(lang, `/${team}/audits`);
  return go(lang, `/console/${team}/audits/${id}`);
}

// ── Builds from Git (phase 2) ─────────────────────────────────────────────────────────────────

/** Sends the admin to GitHub to install the app (and come back to this project). */
export async function connectGithubAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  let url: string;
  try {
    url = (
      await getCloudGithubInstallUrl(
        formString(formData, 'team'),
        formString(formData, 'project') || undefined,
      )
    ).url;
  } catch {
    await go(
      locale,
      `/console/${formString(formData, 'team')}/${formString(formData, 'project')}?tab=git&github=error`,
    );
    return;
  }
  redirect(url);
}

export async function saveGitAction(
  locale: string,
  path: string,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.git' });
  const values = formValues(formData);
  const [installation, repo] = formString(formData, 'repo').split(':').map(Number);
  const branch = formString(formData, 'branch');
  if (!installation || !repo)
    return { status: 'error', fieldErrors: { repo: t('repoRequired') }, values };
  if (!/^[\w./-]{1,200}$/.test(branch))
    return { status: 'error', fieldErrors: { branch: t('branchInvalid') }, values };
  const node = formString(formData, 'nodeVersion');
  try {
    await setCloudGit(projectId, {
      installationId: installation,
      repoId: repo,
      branch,
      rootDir: formString(formData, 'rootDir'),
      installCommand: formString(formData, 'installCommand') || 'npm ci',
      buildCommand: formString(formData, 'buildCommand') || 'npm run build',
      outputDir: formString(formData, 'outputDir'),
      nodeVersion: ['20', '22', '24'].includes(node) ? node : '24',
      buildBranches: formBoolean(formData, 'buildBranches'),
      buildPullRequests: formBoolean(formData, 'buildPullRequests'),
    });
  } catch (error) {
    if (isApiError(error) && error.status === 400) {
      return {
        status: 'error',
        message: error.fieldErrors._form ?? error.detail ?? t('invalid'),
        fieldErrors: error.fieldErrors,
        values,
      };
    }
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return { status: 'success', message: t('saved') };
}

export async function disconnectGitAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await disconnectCloudGit(formString(formData, 'project')).catch(() => undefined);
  refresh(locale, formString(formData, 'path'));
}

export async function saveEnvAction(
  locale: string,
  path: string,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.git' });
  const key = formString(formData, 'key').toUpperCase();
  const value = String(formData.get('value') ?? '');
  const production = formBoolean(formData, 'production');
  const preview = formBoolean(formData, 'preview');
  if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key))
    return { status: 'error', fieldErrors: { key: t('keyInvalid') }, values: { key } };
  if (!production && !preview)
    return { status: 'error', fieldErrors: { production: t('targetRequired') }, values: { key } };
  try {
    await setCloudEnv(projectId, { key, value: value.slice(0, 4096), production, preview });
  } catch (error) {
    return failure(lang, error, { key });
  }
  refresh(lang, path);
  return { status: 'success', message: t('envSaved') };
}

export async function deleteEnvAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudEnv(formString(formData, 'project'), formString(formData, 'key')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

export async function startBuildAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  const slug = formString(formData, 'slug');
  let number: number | null = null;
  try {
    number = (await startCloudBuild(formString(formData, 'project'))).number;
  } catch {
    // The page shows the builds as they are.
  }
  refresh(locale, `/${team}/${slug}`);
  await go(
    locale,
    number ? `/console/${team}/${slug}/builds/${number}` : `/console/${team}/${slug}?tab=builds`,
  );
}

export async function cancelBuildAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  const slug = formString(formData, 'slug');
  const number = Number(formString(formData, 'number'));
  await cancelCloudBuild(formString(formData, 'project'), number).catch(() => undefined);
  refresh(locale, `/${team}/${slug}/builds/${number}`);
}

// ── Build notifications (decision 43) ─────────────────────────────────────────────────────────

const NOTIFY_KINDS: CloudNotifyKind[] = ['EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK'];

/** Why `url` can't be a channel of `kind`, as a key of Cloud.notify, or null. */
function notifyUrlProblem(
  kind: CloudNotifyKind,
  raw: string,
): 'urlInvalid' | 'urlHttps' | 'urlSlack' | 'urlDiscord' | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'urlInvalid';
  }
  if (url.protocol !== 'https:') return 'urlHttps';
  if (
    kind === 'SLACK' &&
    !(url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/'))
  )
    return 'urlSlack';
  if (
    kind === 'DISCORD' &&
    !(
      /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/.test(url.hostname) &&
      url.pathname.startsWith('/api/webhooks/')
    )
  )
    return 'urlDiscord';
  return null;
}

function notifyEvents(formData: FormData, locale: AppLocale) {
  return {
    buildFailed: formBoolean(formData, 'buildFailed'),
    buildSucceeded: formBoolean(formData, 'buildSucceeded'),
    previews: formBoolean(formData, 'previews'),
    locale,
  };
}

/** Adds a channel; a webhook's signing secret goes back once in the values (`token`). */
export async function createNotifyAction(
  locale: string,
  path: string,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.notify' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  const kind = formString(formData, 'kind') as CloudNotifyKind;
  const url = formString(formData, 'url');
  const recipientIds = formData.getAll('recipients').map(String).filter(Boolean);
  const fieldErrors: Record<string, string> = {};
  if (name.length < 1 || name.length > 60) fieldErrors.name = t('nameInvalid');
  if (!NOTIFY_KINDS.includes(kind)) fieldErrors.kind = t('kindInvalid');
  else if (kind === 'EMAIL') {
    if (recipientIds.length < 1 || recipientIds.length > 10)
      fieldErrors.recipients = t('recipientsInvalid');
  } else {
    const problem = notifyUrlProblem(kind, url);
    if (problem) fieldErrors.url = t(problem);
  }
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors, values };
  const events = notifyEvents(formData, lang);
  let secret: string | undefined;
  try {
    const created = await createCloudNotification(
      projectId,
      kind === 'EMAIL' ? { kind, name, recipientIds, ...events } : { kind, name, url, ...events },
    );
    secret = created.secret;
  } catch (error) {
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return secret
    ? {
        status: 'success',
        message: t('createdSecret'),
        // The secret to copy, and the form's defaults back (any echoed value replaces them all).
        values: { token: secret, buildFailed: 'on', recipients: recipientIds.join('\n') },
      }
    : { status: 'success', message: t('created') };
}

/** Saves a channel's name, events and (when given) a new URL or new recipients. */
export async function updateNotifyAction(
  locale: string,
  path: string,
  projectId: string,
  channelId: string,
  kind: CloudNotifyKind,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.notify' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  const url = formString(formData, 'url');
  const recipientIds = formData.getAll('recipients').map(String).filter(Boolean);
  const fieldErrors: Record<string, string> = {};
  if (name.length < 1 || name.length > 60) fieldErrors.name = t('nameInvalid');
  if (kind === 'EMAIL' && (recipientIds.length < 1 || recipientIds.length > 10))
    fieldErrors.recipients = t('recipientsInvalid');
  if (kind !== 'EMAIL' && url) {
    const problem = notifyUrlProblem(kind, url);
    if (problem) fieldErrors.url = t(problem);
  }
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors, values };
  try {
    await updateCloudNotification(projectId, channelId, {
      name,
      ...notifyEvents(formData, lang),
      ...(kind === 'EMAIL' ? { recipientIds } : url ? { url } : {}),
    });
  } catch (error) {
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return { status: 'success', message: t('saved') };
}

/** "Send a test": the result as the form's message. */
export async function testNotifyAction(
  locale: string,
  path: string,
  projectId: string,
  channelId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.notify' });
  try {
    const result = await testCloudNotification(projectId, channelId);
    refresh(lang, path);
    return result.ok
      ? { status: 'success', message: t('testSent') }
      : { status: 'error', message: t('testFailed', { error: result.error ?? '' }) };
  } catch (error) {
    return failure(lang, error);
  }
}

export async function toggleNotifyAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await updateCloudNotification(formString(formData, 'project'), formString(formData, 'id'), {
    enabled: formString(formData, 'enabled') === 'on',
  }).catch(() => undefined);
  refresh(locale, formString(formData, 'path'));
}

export async function deleteNotifyAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudNotification(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

// ── Web analytics and key-value store (architecture 4.13, decisions 44 and 45) ──────────────

export async function toggleAnalyticsAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await setCloudAnalytics(
    formString(formData, 'project'),
    formString(formData, 'enabled') === 'on',
  ).catch(() => undefined);
  refresh(locale, formString(formData, 'path'));
}

const KV_KEY = /^[A-Za-z0-9._:-]{1,256}$/;

/** Writes one key of a project's store; the value is JSON (or plain text, kept as a string). */
export async function putKvAction(
  locale: string,
  path: string,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.kv' });
  const values = formValues(formData);
  const key = formString(formData, 'key');
  const raw = String(formData.get('value') ?? '');
  const ttlText = formString(formData, 'ttl');
  const fieldErrors: Record<string, string> = {};
  if (!KV_KEY.test(key)) fieldErrors.key = t('keyInvalid');
  let value: unknown = raw;
  if (formString(formData, 'asText') !== 'on') {
    try {
      value = JSON.parse(raw);
    } catch {
      fieldErrors.value = t('valueInvalid');
    }
  }
  const ttl = ttlText ? Number(ttlText) : undefined;
  if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 1 || ttl > 365 * 86_400)) {
    fieldErrors.ttl = t('ttlInvalid');
  }
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors, values };
  try {
    await putCloudKv(projectId, key, value, ttl);
  } catch (error) {
    if (isApiError(error) && error.status === 413) {
      return { status: 'error', fieldErrors: { value: t('tooBig') }, values };
    }
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return { status: 'success', message: t('saved', { key }) };
}

export async function deleteKvAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudKv(formString(formData, 'project'), formString(formData, 'key')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

/** Sends an owner to Stripe: Checkout to upgrade, or the customer portal (decision 46). */
export async function billingAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const team = formString(formData, 'team');
  const kind = formString(formData, 'kind') === 'portal' ? 'portal' : 'checkout';
  let url: string;
  try {
    url = (await cloudBillingLink(team, kind, locale)).url;
  } catch {
    await go(locale, `/console/${team}/plan?billing=error`);
    return;
  }
  redirect(url);
}

// ── Managed databases (architecture 4.13 "Databases", decision 47) ──────────────────────────

/** Creates a database; its connection string with the password is shown once. */
export async function createDatabaseAction(
  locale: string,
  path: string,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.databases' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  if (name.length < 1 || name.length > 40) {
    return { status: 'error', fieldErrors: { name: t('nameInvalid') }, values };
  }
  let url: string;
  try {
    url = (await createCloudDatabase(projectId, name)).connectionUrl;
  } catch (error) {
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return { status: 'success', message: t('created'), values: { token: url } };
}

/** A new password: the old one stops working and its connections are closed. */
export async function resetDatabaseAction(
  locale: string,
  path: string,
  projectId: string,
  databaseId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.databases' });
  let url: string;
  try {
    url = (await resetCloudDatabase(projectId, databaseId)).connectionUrl;
  } catch (error) {
    return failure(lang, error);
  }
  refresh(lang, path);
  return { status: 'success', message: t('reset'), values: { token: url } };
}

export async function deleteDatabaseAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudDatabase(formString(formData, 'project'), formString(formData, 'id')).catch(
    () => undefined,
  );
  refresh(locale, formString(formData, 'path'));
}

// ── Object storage (architecture 4.13 "Object storage", decision 48) ────────────────────────

const BUCKET = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export async function createBucketAction(
  locale: string,
  path: string,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.storage' });
  const values = formValues(formData);
  const name = formString(formData, 'name').toLowerCase();
  if (!BUCKET.test(name))
    return { status: 'error', fieldErrors: { name: t('nameInvalid') }, values };
  try {
    await createCloudBucket(projectId, name);
  } catch (error) {
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return { status: 'success', message: t('created', { name }) };
}

/** A key of one bucket; its secret is shown once (as "id secret" to copy together). */
export async function createBucketKeyAction(
  locale: string,
  path: string,
  projectId: string,
  bucketId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Cloud.storage' });
  const values = formValues(formData);
  const name = formString(formData, 'name');
  if (name.length < 1 || name.length > 60) {
    return { status: 'error', fieldErrors: { name: t('keyNameInvalid') }, values };
  }
  let secret: string;
  let id: string;
  try {
    const key = await createCloudBucketKey(projectId, bucketId, {
      name,
      write: formBoolean(formData, 'write'),
    });
    secret = key.secretAccessKey;
    id = key.accessKeyId;
  } catch (error) {
    return failure(lang, error, values);
  }
  refresh(lang, path);
  return {
    status: 'success',
    message: t('keyCreated', { id }),
    values: { token: secret },
  };
}

/** Deletes an empty bucket; one with objects answers why it can't. */
export async function deleteBucketAction(
  locale: string,
  path: string,
  projectId: string,
  bucketId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  try {
    await deleteCloudBucket(projectId, bucketId);
  } catch (error) {
    return failure(lang, error);
  }
  refresh(lang, path);
  return { status: 'success' };
}

export async function deleteBucketKeyAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCloudBucketKey(
    formString(formData, 'project'),
    formString(formData, 'bucket'),
    formString(formData, 'id'),
  ).catch(() => undefined);
  refresh(locale, formString(formData, 'path'));
}
