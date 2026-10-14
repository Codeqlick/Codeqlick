import 'server-only';
import { apiFetch } from './client';
import type { AuthTokens, AuthUser, Locale } from './types';

export function login(input: { email: string; password: string }) {
  return apiFetch<AuthTokens>('/auth/login', {
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
