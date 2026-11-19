import 'server-only';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import type {
  MenuContent,
  MenuLimits,
  MenuReportReason,
  MenuSettings,
  MenuSummary,
  MenuView,
  PublicMenu,
} from '@/lib/menu';
import { apiFetch } from './client';
import { ApiError } from './errors';
import type { Paginated } from './types';

/** Menu: QR menus and catalogues (architecture 4.20). Shapes mirror the API's menus module. */

export type MenuSettingsInput = Partial<MenuSettings> & { content?: MenuContent };
export type MenuCreateInput = MenuSettings & { content?: MenuContent };

export async function listMenus(): Promise<{ items: MenuSummary[]; limits: MenuLimits }> {
  return apiFetch('/menus', { auth: 'required' });
}

export function getMenu(id: string) {
  return apiFetch<MenuView>(`/menus/${encodeURIComponent(id)}`, { auth: 'required' });
}

export function createMenu(input: MenuCreateInput) {
  return apiFetch<MenuView>('/menus', { method: 'POST', auth: 'required', body: input });
}

/** Saves the settings (everything but the content); `revision` is the one the person loaded. */
export function updateMenuSettings(id: string, input: MenuSettingsInput & { revision: number }) {
  return apiFetch<MenuView>(`/menus/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: 'required',
    body: input,
  });
}

/** The quick availability switches: hide an item or mark it sold out. */
export function setMenuItemFlags(
  id: string,
  key: string,
  flags: { hidden?: boolean; soldOut?: boolean },
) {
  return apiFetch<{ revision: number }>(
    `/menus/${encodeURIComponent(id)}/items/${encodeURIComponent(key)}`,
    { method: 'PATCH', auth: 'required', body: flags },
  );
}

export function checkMenuSlug(slug: string, menuId?: string) {
  return apiFetch<{ available: boolean; reason?: 'taken' | 'reserved' | 'invalid' }>(
    '/menus/slug-check',
    { auth: 'required', query: { slug, menuId } },
  );
}

export function deleteMenu(id: string) {
  return apiFetch<void>(`/menus/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** The menu's QR as an SVG document (the owner's), or null when the API has none. */
export async function fetchMenuQr(id: string): Promise<string | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) throw new ApiError(401, { title: 'Unauthorized', detail: 'Not signed in' });
  const response = await fetch(`${env.API_URL}/menus/${encodeURIComponent(id)}/qr.svg`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'image/svg+xml' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(response.status, { title: response.statusText });
  return response.text();
}

export type PublicMenuResult =
  { status: 'found'; menu: PublicMenu } | { status: 'moved'; slug: string } | { status: 'missing' };

/**
 * The public page's menu. A renamed slug answers `308` with the new one in the body: read, not
 * followed, so the visitor is sent to the new address. Missing, paused and suspended are one
 * thing (the page doesn't say why).
 */
export async function getPublicMenu(slug: string): Promise<PublicMenuResult> {
  let response: Response;
  try {
    response = await fetch(`${env.API_URL}/menus/p/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(503, { title: 'Service Unavailable', detail: 'API unreachable' });
  }
  if (response.status === 308 || response.status === 301 || response.status === 302) {
    try {
      const body = (await response.json()) as { slug?: string };
      if (body.slug) return { status: 'moved', slug: body.slug };
    } catch {
      const location = response.headers.get('location') ?? '';
      const slugOfLocation = location.split('/').pop();
      if (slugOfLocation) return { status: 'moved', slug: decodeURIComponent(slugOfLocation) };
    }
    return { status: 'missing' };
  }
  if (response.status === 404 || response.status === 400) return { status: 'missing' };
  if (!response.ok) throw new ApiError(response.status, { title: response.statusText });
  return { status: 'found', menu: (await response.json()) as PublicMenu };
}

/** `{ slug, language, updatedAt }` of every menu that may be listed in the host's sitemap. */
export async function listMenuSitemap(): Promise<
  { slug: string; language: 'EN' | 'ES'; updatedAt: string }[]
> {
  try {
    return (
      await apiFetch<{ items: { slug: string; language: 'EN' | 'ES'; updatedAt: string }[] }>(
        '/menus/sitemap',
        { revalidate: 3600 },
      )
    ).items;
  } catch {
    // An unreachable API must not break the sitemap (or the build).
    return [];
  }
}

export function reportMenu(input: {
  slug: string;
  reason: MenuReportReason;
  details: string;
  email?: string;
  website?: string;
}) {
  return apiFetch<void>('/menus/reports', { method: 'POST', body: input, forwardClientIp: true });
}

// ── Admin ────────────────────────────────────────────────────────────────────────────────────

export type AdminMenu = {
  id: string;
  slug: string;
  businessName: string;
  kind: 'MENU' | 'CATALOGUE';
  owner: { id: string; name: string; email: string };
  enabled: boolean;
  indexable: boolean;
  suspendedAt: string | null;
  reports: number;
  updatedAt: string;
};

export type MenuReportStatus = 'OPEN' | 'CLOSED';

export type AdminMenuReport = {
  id: string;
  slug: string;
  businessName: string;
  reason: MenuReportReason;
  details: string;
  email: string | null;
  status: MenuReportStatus;
  note: string | null;
  menu: { id: string; slug: string; suspended: boolean } | null;
  createdAt: string;
  closedAt: string | null;
};

export function adminListMenus(query: { q?: string; suspended?: boolean; page?: number }) {
  return apiFetch<Paginated<AdminMenu>>('/admin/menus', {
    auth: 'required',
    query: { q: query.q, suspended: query.suspended, page: query.page, pageSize: 20 },
  });
}

export function adminListMenuReports(query: { status: MenuReportStatus; page?: number }) {
  return apiFetch<Paginated<AdminMenuReport>>('/admin/menus/reports', {
    auth: 'required',
    query: { status: query.status, page: query.page, pageSize: 20 },
  });
}

export function adminCloseMenuReport(id: string, note?: string) {
  return apiFetch<void>(`/admin/menus/reports/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    auth: 'required',
    body: note ? { note } : {},
  });
}

export function adminSuspendMenu(id: string, reason: string) {
  return apiFetch<void>(`/admin/menus/${encodeURIComponent(id)}/suspend`, {
    method: 'POST',
    auth: 'required',
    body: { reason },
  });
}

export function adminUnsuspendMenu(id: string) {
  return apiFetch<void>(`/admin/menus/${encodeURIComponent(id)}/suspension`, {
    method: 'DELETE',
    auth: 'required',
  });
}
