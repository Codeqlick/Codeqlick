import 'server-only';
import { apiFetch } from './client';
import type { AuthTokens, AuthUser } from './types';

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

export function me(token?: string) {
  return apiFetch<AuthUser>('/auth/me', { auth: 'required', token });
}
