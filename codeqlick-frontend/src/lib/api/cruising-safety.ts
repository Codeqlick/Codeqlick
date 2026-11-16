import 'server-only';
import type {
  CruisingHealth,
  CruisingTimer,
  HealthCenter,
  HealthCenterPlaces,
  TrustedContact,
} from '@/lib/cruising-safety';
import type { SpotImportFormat } from '@/lib/cruising';
import { apiFetch } from './client';

/** Cruising's safety and health (architecture 4.15, phase 5; decisions 94 and 95). */

// ---- Public ------------------------------------------------------------------------------------

/** A trusted contact's answer from the website (no session: the token is the proof). */
export function respondTrustedContact(token: string, accept: boolean) {
  return apiFetch<void>('/cruising/trusted-contacts/respond', {
    method: 'POST',
    body: { token, accept },
    forwardClientIp: true,
  });
}

/** Every testing centre (up to 1000), for the public /health page. */
export async function listHealthCenters(): Promise<HealthCenter[]> {
  return (
    await apiFetch<{ items: HealthCenter[] }>('/cruising/health-centers', { revalidate: 300 })
  ).items;
}

export function getHealthCenterPlaces() {
  return apiFetch<HealthCenterPlaces>('/cruising/health-centers/places', { revalidate: 300 });
}

// ---- Members -----------------------------------------------------------------------------------

export async function listTrustedContacts(): Promise<TrustedContact[]> {
  return (
    await apiFetch<{ items: TrustedContact[] }>('/cruising/trusted-contacts', {
      auth: 'required',
    })
  ).items;
}

export function addTrustedContact(input: { email: string; displayName: string }) {
  return apiFetch<TrustedContact>('/cruising/trusted-contacts', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function deleteTrustedContact(id: string) {
  return apiFetch<void>(`/cruising/trusted-contacts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** My running timer, or null. */
export async function getMyTimer(): Promise<CruisingTimer | null> {
  return (await apiFetch<CruisingTimer | null>('/cruising/timer', { auth: 'required' })) ?? null;
}

export function startTimer(input: {
  minutes: number;
  message: string | null;
  shareSpot: boolean;
  spotId?: string;
}) {
  return apiFetch<CruisingTimer>('/cruising/timer', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function extendTimer(minutes: number) {
  return apiFetch<CruisingTimer>('/cruising/timer/extend', {
    method: 'POST',
    body: { minutes },
    auth: 'required',
  });
}

export function endTimer() {
  return apiFetch<void>('/cruising/timer', { method: 'DELETE', auth: 'required' });
}

export function getMyHealth() {
  return apiFetch<CruisingHealth>('/cruising/health', { auth: 'required' });
}

export function saveMyHealth(input: Record<string, unknown>) {
  return apiFetch<CruisingHealth>('/cruising/health', {
    method: 'PUT',
    body: input,
    auth: 'required',
  });
}

// ---- Admin -------------------------------------------------------------------------------------

export type HealthCenterInput = Omit<HealthCenter, 'id' | 'citySlug'>;

export type HealthImportResult = {
  created: number;
  skipped: { row: number; reason: string }[];
  items: { row: number; name: string; city: string; countryCode: string }[];
};

export async function listAdminHealthCenters(q?: string): Promise<HealthCenter[]> {
  return (
    await apiFetch<{ items: HealthCenter[] }>('/admin/cruising/health-centers', {
      query: { q: q || undefined },
      auth: 'required',
    })
  ).items;
}

export function createHealthCenter(input: HealthCenterInput) {
  return apiFetch<{ id: string }>('/admin/cruising/health-centers', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function updateHealthCenter(id: string, input: Partial<HealthCenterInput>) {
  return apiFetch<void>(`/admin/cruising/health-centers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function deleteHealthCenter(id: string) {
  return apiFetch<void>(`/admin/cruising/health-centers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export function importHealthCenters(input: {
  format: SpotImportFormat;
  content: string;
  dryRun: boolean;
}) {
  return apiFetch<HealthImportResult>('/admin/cruising/health-centers/import', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}
