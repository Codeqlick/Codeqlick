import 'server-only';
import { apiFetch } from './client';
import { isApiError } from './errors';
import type { AdminUser, CreatedUser, Paginated, Role, UserInput, UserPatch } from './types';

export function adminListUsers(params: { role?: Role; page?: number; pageSize?: number } = {}) {
  return apiFetch<Paginated<AdminUser>>('/admin/users', {
    auth: 'required',
    query: { role: params.role, page: params.page, pageSize: params.pageSize },
  });
}

/**
 * Section 5 lists `GET /admin/users` and `PATCH /admin/users/:id` but no `GET /admin/users/:id`.
 * We try the conventional detail route first and fall back to scanning the list.
 */
export async function adminGetUser(id: string): Promise<AdminUser | null> {
  try {
    return await apiFetch<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, {
      auth: 'required',
    });
  } catch (error) {
    // 404 / 405 from a backend without the detail route: fall back to the list.
    if (!isApiError(error) || (error.status !== 404 && error.status !== 405)) throw error;
  }
  for (let page = 1; page <= 20; page += 1) {
    const result = await adminListUsers({ page, pageSize: 100 });
    const match = result.items.find((user) => user.id === id);
    if (match) return match;
    if (page >= result.totalPages) break;
  }
  return null;
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
