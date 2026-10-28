import 'server-only';
import { apiFetch } from './client';
import { isApiError } from './errors';
import type { AdminUser, CreatedUser, Paginated, Role, UserInput, UserPatch } from './types';

/**
 * `memberOf`: the people of a client company. `accounts`: client accounts only, without their
 * people (e.g. to pick a project's client).
 */
export function adminListUsers(
  params: {
    role?: Role;
    page?: number;
    pageSize?: number;
    memberOf?: string;
    accounts?: boolean;
  } = {},
) {
  return apiFetch<Paginated<AdminUser>>('/admin/users', {
    auth: 'required',
    query: {
      role: params.role,
      page: params.page,
      pageSize: params.pageSize,
      memberOf: params.memberOf,
      accounts: params.accounts ? 'true' : undefined,
    },
  });
}

/** The user with what hangs from the account (`owns`), or null when there is none. */
export async function adminGetUser(id: string): Promise<AdminUser | null> {
  try {
    return await apiFetch<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, {
      auth: 'required',
    });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

export function adminCreateUser(input: UserInput) {
  return apiFetch<CreatedUser>('/admin/users', { method: 'POST', body: input, auth: 'required' });
}

/** Sends (again) the welcome email with a link to choose a password, in the user's language. */
export function adminSendInvitation(id: string) {
  return apiFetch<void>(`/admin/users/${encodeURIComponent(id)}/invitation`, {
    method: 'POST',
    body: {},
    auth: 'required',
  });
}

/** Deletes the account and what hangs from it; 409 while it owns projects. */
export function adminDeleteUser(id: string) {
  return apiFetch<void>(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export function adminUpdateUser(id: string, input: UserPatch) {
  return apiFetch<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

/** Sends a client their weekly summary now; `sent: false` when they have no news this week. */
export function adminSendWeeklyDigest(id: string) {
  return apiFetch<{ sent: boolean; reason?: string }>(
    `/admin/projects/weekly-digest/${encodeURIComponent(id)}`,
    { method: 'POST', auth: 'required' },
  );
}
