import 'server-only';
import type { Webapp } from '../webapps';
import { apiFetch } from './client';
import type { NativeSsoClient, SsoClient } from '../sso';
import type {
  AccountActivity,
  AccountApp,
  ActiveSession,
  AuthTokens,
  AuthUser,
  AccountLocale,
  Locale,
  LoginResult,
  Passkey,
  PasskeyLoginOptions,
  TwoFactorSetup,
  Preferences,
  TwoFactorStatus,
  WebAuthnJson,
} from './types';

/** A sign-in with a passkey, first step: a challenge for any passkey the browser has. */
export function passkeyLoginOptions() {
  return apiFetch<PasskeyLoginOptions>('/auth/passkeys/login/options', {
    method: 'POST',
    forwardClientIp: true,
  });
}

/** Second step: the browser's assertion. Tokens like a password sign-in, no code asked. */
export function passkeyLogin(input: { challengeId: string; response: WebAuthnJson }) {
  return apiFetch<AuthTokens>('/auth/passkeys/login/verify', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export function listPasskeys() {
  return apiFetch<{ items: Passkey[] }>('/auth/passkeys', { auth: 'required' });
}

/** Adding a passkey, first step: the password again, then the browser's creation options. */
export function passkeyRegistrationOptions(password: string) {
  return apiFetch<WebAuthnJson>('/auth/passkeys/register/options', {
    method: 'POST',
    body: { password },
    auth: 'required',
    forwardClientIp: true,
  });
}

export function registerPasskey(input: { response: WebAuthnJson; name?: string }) {
  return apiFetch<Passkey>('/auth/passkeys/register/verify', {
    method: 'POST',
    body: input,
    auth: 'required',
    forwardClientIp: true,
  });
}

export function renamePasskey(id: string, name: string) {
  return apiFetch<Passkey>(`/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { name },
    auth: 'required',
  });
}

export function deletePasskey(id: string, password: string) {
  return apiFetch<void>(`/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: { password },
    auth: 'required',
    forwardClientIp: true,
  });
}

export function login(input: { email: string; password: string; captcha?: string }) {
  return apiFetch<LoginResult>('/auth/login', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export function refresh(refreshToken: string) {
  return apiFetch<AuthTokens>('/auth/refresh', { method: 'POST', body: { refreshToken } });
}

export function logout(refreshToken: string) {
  return apiFetch<void>('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    auth: 'optional',
  });
}

/** Changes the signed-in user's password; `refreshToken` is the session that stays signed in. */
export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  refreshToken: string;
}) {
  return apiFetch<void>('/auth/password', {
    method: 'POST',
    body: input,
    auth: 'required',
    forwardClientIp: true,
  });
}

/** Asks the API to email a reset link. It answers the same whether or not the account exists. */
export function requestPasswordReset(input: { email: string; locale: Locale }) {
  return apiFetch<void>('/auth/password-reset/request', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export function confirmPasswordReset(input: { token: string; newPassword: string }) {
  return apiFetch<void>('/auth/password-reset/confirm', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export function me(token?: string) {
  return apiFetch<AuthUser>('/auth/me', { auth: 'required', token });
}

/** Second step of a login with two-step verification. */
export function verifyTwoFactor(input: { challengeToken: string; code: string }) {
  return apiFetch<AuthTokens>('/auth/2fa/verify', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export function getPreferences() {
  return apiFetch<Preferences>('/auth/preferences', { auth: 'required' });
}

export function updatePreferences(input: Preferences) {
  return apiFetch<Preferences>('/auth/preferences', {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function getTwoFactorStatus() {
  return apiFetch<TwoFactorStatus>('/auth/2fa', { auth: 'required' });
}

export function startTwoFactorSetup() {
  return apiFetch<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST', auth: 'required' });
}

export function enableTwoFactor(code: string) {
  return apiFetch<{ recoveryCodes: string[] }>('/auth/2fa/enable', {
    method: 'POST',
    body: { code },
    auth: 'required',
    forwardClientIp: true,
  });
}

export function disableTwoFactor(input: { password: string; code: string }) {
  return apiFetch<void>('/auth/2fa/disable', {
    method: 'POST',
    body: input,
    auth: 'required',
    forwardClientIp: true,
  });
}

export function listSessions() {
  return apiFetch<ActiveSession[]>('/auth/sessions', { auth: 'required' });
}

export function revokeSession(id: string) {
  return apiFetch<void>(`/auth/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Signs out every other device; `refreshToken` is the session that stays signed in. */
export function revokeOtherSessions(refreshToken: string) {
  return apiFetch<void>('/auth/sessions/revoke-others', {
    method: 'POST',
    body: { refreshToken },
    auth: 'required',
  });
}

/** Self-registration: the API emails the link that confirms it; same answer for any email. */
export function register(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  locale: AccountLocale;
  acceptPrivacy: true;
  website?: string;
  app?: Webapp;
  captcha?: string;
}) {
  return apiFetch<void>('/auth/register', { method: 'POST', body: input, forwardClientIp: true });
}

/**
 * The emailed link of a self-registration: the account is created and signed in. `username`
 * replaces the one chosen at sign-up when someone took it meanwhile (409 `username: taken`).
 */
export function confirmSignup(token: string, username?: string) {
  return apiFetch<AuthTokens>('/auth/register/confirm', {
    method: 'POST',
    body: username === undefined ? { token } : { token, username },
    forwardClientIp: true,
  });
}

/** Who the team's invitation is for. */
export function signupInvitation(token: string) {
  return apiFetch<{ email: string; name: string }>(
    `/auth/register/invitation?token=${encodeURIComponent(token)}`,
    { forwardClientIp: true },
  );
}

/** Accepts the team's invitation: the account is theirs and signed in. */
export function acceptInvitation(input: {
  token: string;
  name: string;
  username: string;
  password: string;
  locale: AccountLocale;
  acceptPrivacy: true;
}) {
  return apiFetch<AuthTokens>('/auth/register/invitation', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

/** The caller's own name (and email language). */
export function updateMe(input: { name?: string; locale?: AccountLocale }) {
  return apiFetch<AuthUser>('/auth/me', { method: 'PATCH', body: input, auth: 'required' });
}

export type UsernameCheck = {
  username: string;
  available: boolean;
  reason?: 'invalid' | 'reserved' | 'taken';
};

/** Whether the caller could take a username (their own, in any capitals, counts as available). */
export function checkUsername(username: string) {
  return apiFetch<UsernameCheck>(
    `/auth/username/available?username=${encodeURIComponent(username)}`,
    { auth: 'required' },
  );
}

/** Whether a username is free for an account still to be made (the sign-up forms). */
export function checkSignupUsername(username: string) {
  return apiFetch<UsernameCheck>(
    `/auth/register/username?username=${encodeURIComponent(username)}`,
    { forwardClientIp: true },
  );
}

/** Sets the profile photo (the API makes a 256×256 WebP of it). */
export function uploadAvatar(file: File) {
  const form = new FormData();
  form.set('file', file, 'photo.jpg');
  return apiFetch<AuthUser>('/auth/me/avatar', {
    method: 'POST',
    body: form,
    auth: 'required',
    signal: AbortSignal.timeout(30_000),
  });
}

export function removeAvatar() {
  return apiFetch<AuthUser>('/auth/me/avatar', { method: 'DELETE', auth: 'required' });
}

/** Chooses, changes or (null) removes the caller's username. */
export function setUsername(username: string | null) {
  return apiFetch<AuthUser>('/auth/me/username', {
    method: 'PUT',
    body: { username },
    auth: 'required',
  });
}

/** Emails a confirmation link to the new address; the email changes once it is opened. */
export function requestEmailChange(input: { email: string; password: string; locale: Locale }) {
  return apiFetch<void>('/auth/email', {
    method: 'POST',
    body: input,
    auth: 'required',
    forwardClientIp: true,
  });
}

export function confirmEmailChange(token: string) {
  return apiFetch<{ email: string }>('/auth/email/confirm', {
    method: 'POST',
    body: { token },
    forwardClientIp: true,
  });
}

/** Everything the platform keeps about the caller, as JSON text (GDPR). */
export function exportMyData() {
  return apiFetch<string>('/auth/me/export', {
    auth: 'required',
    responseType: 'text',
    signal: AbortSignal.timeout(30_000),
  });
}

export function deleteMe(password: string) {
  return apiFetch<void>('/auth/me', {
    method: 'DELETE',
    body: { password },
    auth: 'required',
    forwardClientIp: true,
  });
}

/**
 * Single sign-on (decision 108): the account host asks for a one-time code for a client host, or
 * for a desktop program with the loopback address the code will be sent to.
 */
export function createSsoCode(input: {
  client: SsoClient | NativeSsoClient;
  codeChallenge: string;
  redirectUri?: string;
}) {
  return apiFetch<{ code: string; expiresIn: number }>('/auth/sso/codes', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** The client host's callback exchanges the code and its verifier for a session of its own. */
export function exchangeSsoCode(input: { client: SsoClient; code: string; codeVerifier: string }) {
  return apiFetch<AuthTokens>('/auth/sso/exchange', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

/** "Sign out of this device everywhere": this browser's account session and its apps' sessions. */
export function revokeDevice(refreshToken: string) {
  return apiFetch<void>('/auth/sessions/revoke-device', {
    method: 'POST',
    body: { refreshToken },
    auth: 'required',
  });
}

/** "Sign out of all devices". */
export function revokeAllSessions() {
  return apiFetch<void>('/auth/sessions/revoke-all', { method: 'POST', auth: 'required' });
}

/** The caller's recent account activity. */
export function accountActivity() {
  return apiFetch<{ items: AccountActivity[] }>('/auth/activity', { auth: 'required' });
}

/** The parts of the platform the caller uses. */
export function accountApps() {
  return apiFetch<{ items: AccountApp[] }>('/auth/apps', { auth: 'required' });
}
