import 'server-only';
import { apiFetch } from './client';
import type { SavedReply } from './types';

export function adminListSavedReplies() {
  return apiFetch<SavedReply[]>('/admin/saved-replies', { auth: 'required' });
}

export function adminCreateSavedReply(input: { title: string; body: string }) {
  return apiFetch<SavedReply>('/admin/saved-replies', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function adminUpdateSavedReply(id: string, input: { title: string; body: string }) {
  return apiFetch<SavedReply>(`/admin/saved-replies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function adminDeleteSavedReply(id: string) {
  return apiFetch<void>(`/admin/saved-replies/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
