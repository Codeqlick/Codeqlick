import 'server-only';
import type { Interval, Weekday } from '@/lib/booking';
import { apiFetch } from './client';
import { isApiError } from './errors';

/** Citas: online bookings (architecture 4.9). Shapes mirror the API's citas module. */

export type Weekly = Record<Weekday, Interval[]>;

export type CitasPage = {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  location: string;
  video: boolean;
  meetingCode: string | null;
  askPhone: boolean;
  timeZone: string;
  weekly: Weekly;
  minNoticeHours: number;
  horizonDays: number;
  enabled: boolean;
  upcoming: number;
  createdAt: string;
};

export type CitasPageInput = Omit<CitasPage, 'id' | 'meetingCode' | 'upcoming' | 'createdAt'>;

export type PublicCitasPage = {
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  location: string;
  video: boolean;
  askPhone: boolean;
  timeZone: string;
  ownerName: string;
  enabled: boolean;
  slots: string[];
};

export type CitasAppointment = {
  id: string;
  page: { id: string; slug: string; title: string };
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  locale: 'en' | 'es';
  startsAt: string;
  endsAt: string;
  timeZone: string;
  status: 'CONFIRMED' | 'CANCELLED';
  cancelledAt: string | null;
  createdAt: string;
};

export type BookedAppointment = {
  id: string;
  slug: string;
  title: string;
  ownerName: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  location: string;
  meetingCode: string | null;
  status: 'CONFIRMED' | 'CANCELLED';
};

export async function listCitasPages(): Promise<CitasPage[]> {
  return (await apiFetch<{ items: CitasPage[] }>('/citas/pages', { auth: 'required' })).items;
}

export function createCitasPage(input: CitasPageInput) {
  return apiFetch<CitasPage>('/citas/pages', { method: 'POST', auth: 'required', body: input });
}

export function updateCitasPage(id: string, input: Partial<CitasPageInput>) {
  return apiFetch<CitasPage>(`/citas/pages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: 'required',
    body: input,
  });
}

export function deleteCitasPage(id: string) {
  return apiFetch<void>(`/citas/pages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export async function listCitasAppointments(
  scope: 'upcoming' | 'past',
): Promise<CitasAppointment[]> {
  return (
    await apiFetch<{ items: CitasAppointment[] }>(`/citas/appointments?scope=${scope}`, {
      auth: 'required',
    })
  ).items;
}

export function cancelCitasAppointment(id: string) {
  return apiFetch<CitasAppointment>(`/citas/appointments/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    auth: 'required',
  });
}

/** The booking page behind a link with its free times, or null when there is none. */
export async function getPublicCitasPage(slug: string): Promise<PublicCitasPage | null> {
  try {
    return await apiFetch<PublicCitasPage>(`/citas/p/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export function bookCitasAppointment(
  slug: string,
  input: {
    name: string;
    email: string;
    phone?: string;
    note?: string;
    locale: 'en' | 'es';
    startsAt: string;
    website?: string;
  },
) {
  return apiFetch<BookedAppointment>(`/citas/p/${encodeURIComponent(slug)}/appointments`, {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

/** The appointment behind a cancel link, or null when there is none. */
export async function previewCitasCancel(token: string): Promise<BookedAppointment | null> {
  try {
    return await apiFetch<BookedAppointment>('/citas/cancel/preview', {
      method: 'POST',
      body: { token },
      forwardClientIp: true,
    });
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export function cancelCitasWithToken(token: string) {
  return apiFetch<BookedAppointment>('/citas/cancel', {
    method: 'POST',
    body: { token },
    forwardClientIp: true,
  });
}
