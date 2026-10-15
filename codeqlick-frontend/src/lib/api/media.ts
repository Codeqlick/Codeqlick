import 'server-only';
import { apiFetch } from './client';
import type { MediaItem, Paginated, UploadedMedia } from './types';

/** Largest image the API accepts, in bytes. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** File names the API generates for uploads; anything else is not one of our images. */
export const MEDIA_FILENAME = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|jpg|webp|gif)$/;

export function adminUploadImage(file: File) {
  const body = new FormData();
  body.set('file', file);
  return apiFetch<UploadedMedia>('/admin/media', { method: 'POST', body, auth: 'required' });
}

export function adminListMedia(params: { page?: number; pageSize?: number } = {}) {
  return apiFetch<Paginated<MediaItem>>('/admin/media', {
    auth: 'required',
    query: { page: params.page, pageSize: params.pageSize },
  });
}

export function adminDeleteMedia(filename: string) {
  return apiFetch<void>(`/admin/media/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
