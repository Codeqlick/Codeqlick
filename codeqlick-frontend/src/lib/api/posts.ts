import 'server-only';
import { apiFetch } from './client';
import type { AdminPost, Locale, Paginated, PostDetail, PostInput, PostSummary } from './types';

/** Public content is cached for 5 minutes (architecture 6.2). */
export const PUBLIC_REVALIDATE = 300;

export function listPosts(params: { locale: Locale; page?: number; pageSize?: number }) {
  return apiFetch<Paginated<PostSummary>>('/posts', {
    query: { locale: params.locale, page: params.page, pageSize: params.pageSize },
    revalidate: PUBLIC_REVALIDATE,
  });
}

export function getPost(slug: string, locale: Locale) {
  return apiFetch<PostDetail>(`/posts/${encodeURIComponent(slug)}`, {
    query: { locale },
    revalidate: PUBLIC_REVALIDATE,
  });
}

export function adminListPosts(params: { page?: number; pageSize?: number } = {}) {
  return apiFetch<Paginated<AdminPost>>('/admin/posts', {
    auth: 'required',
    query: { page: params.page, pageSize: params.pageSize },
  });
}

export function adminGetPost(id: string) {
  return apiFetch<AdminPost>(`/admin/posts/${encodeURIComponent(id)}`, { auth: 'required' });
}

export function adminCreatePost(input: PostInput) {
  return apiFetch<AdminPost>('/admin/posts', { method: 'POST', body: input, auth: 'required' });
}

export function adminUpdatePost(id: string, input: Partial<PostInput>) {
  return apiFetch<AdminPost>(`/admin/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function adminDeletePost(id: string) {
  return apiFetch<void>(`/admin/posts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
