import 'server-only';
import type { Booking, BookingConfig, BookingSlots } from '@/lib/booking';
import { apiFetch } from './client';

/** Free slots, or null while the page isn't published (or the API is down). Never cached. */
export async function getBookingSlots(): Promise<BookingSlots | null> {
  try {
    return await apiFetch<BookingSlots>('/bookings/slots', { cache: 'no-store' });
  } catch {
    return null;
  }
}

export function createBooking(input: {
  name: string;
  email: string;
  company?: string;
  message?: string;
  locale: 'en' | 'es';
  startsAt: string;
}) {
  return apiFetch<{ id: string; startsAt: string; meetingUrl: string }>('/bookings', {
    method: 'POST',
    body: input,
  });
}

export function cancelBooking(token: string) {
  return apiFetch<{ startsAt: string }>('/bookings/cancel', { method: 'POST', body: { token } });
}

export function adminListBookings(scope: 'upcoming' | 'past') {
  return apiFetch<Booking[]>('/admin/bookings', { auth: 'required', query: { scope } });
}

export function adminCancelBooking(id: string) {
  return apiFetch<Booking>(`/admin/bookings/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    auth: 'required',
  });
}

export function adminGetBookingSettings() {
  return apiFetch<BookingConfig>('/admin/booking-settings', { auth: 'required' });
}

export function adminSaveBookingSettings(config: BookingConfig) {
  return apiFetch<BookingConfig>('/admin/booking-settings', {
    method: 'PUT',
    body: config,
    auth: 'required',
  });
}
