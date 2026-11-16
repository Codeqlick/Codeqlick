import 'server-only';
import type {
  CruisingNotification,
  CruisingVisitor,
  CruisingWink,
} from '@/lib/cruising-notifications';
import { apiFetch } from './client';

/**
 * Cruising's phase 6 (architecture 4.15): winks and profile visits (decision 97) and the
 * notification centre (decision 98). Every call is for a signed-in member who entered.
 */

export function listCruisingNotifications(): Promise<{
  items: CruisingNotification[];
  unread: number;
}> {
  return apiFetch('/cruising/notifications', { auth: 'required' });
}

/** Marks the given notifications, or all of them, read. */
export function markCruisingNotificationsRead(ids?: string[]): Promise<void> {
  return apiFetch('/cruising/notifications/read', {
    method: 'POST',
    body: ids ? { ids } : {},
    auth: 'required',
  });
}

export function winkCruisingMember(nickname: string): Promise<void> {
  return apiFetch(`/cruising/winks/${encodeURIComponent(nickname)}`, {
    method: 'PUT',
    auth: 'required',
  });
}

export async function listCruisingWinks(): Promise<CruisingWink[]> {
  return (await apiFetch<{ items: CruisingWink[] }>('/cruising/winks', { auth: 'required' })).items;
}

export function getCruisingVisits(): Promise<{ showVisits: boolean; items: CruisingVisitor[] }> {
  return apiFetch('/cruising/visits', { auth: 'required' });
}

export function setCruisingVisits(showVisits: boolean): Promise<{ showVisits: boolean }> {
  return apiFetch('/cruising/visits/settings', {
    method: 'PUT',
    body: { showVisits },
    auth: 'required',
  });
}
