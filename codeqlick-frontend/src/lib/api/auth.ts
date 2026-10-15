import 'server-only';
import { apiFetch } from './client';
import type {
  ActiveSession,
  AuthTokens,
  AuthUser,
  Locale,
  LoginResult,
  TwoFactorSetup,
  Preferences,
  TwoFactorStatus,
} from './types';

export function login(input: { email: string; password: string }) {
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
