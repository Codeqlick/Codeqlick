import 'server-only';
import { apiFetch } from './client';
import type {
  AdminPost,
  AdminTag,
  Locale,
  Paginated,
  PostDetail,
  PostInput,
  PostSummary,
  PublicTag,
  TagInput,
} from './types';

/** Public content is cached for 5 minutes (architecture 6.2). */
export const PUBLIC_REVALIDATE = 300;

export function listPosts(params: {
  locale: Locale;
  page?: number;
  pageSize?: number;
  /** Only posts with this tag (its slug). */
  tag?: string;
}) {
  return apiFetch<Paginated<PostSummary>>('/posts', {
    query: { locale: params.locale, page: params.page, pageSize: params.pageSize, tag: params.tag },
    revalidate: PUBLIC_REVALIDATE,
  });
}

/** Tags used by published posts, named in `locale`, with how many posts each. */
export function listTags(locale: Locale) {
  return apiFetch<(PublicTag & { count: number })[]>('/posts/tags', {
    query: { locale },
    revalidate: PUBLIC_REVALIDATE,
  });
}

/** Posts to read after `slug`: sharing its tags first, then the latest. */
export function getRelatedPosts(slug: string, locale: Locale, limit = 3) {
  return apiFetch<PostSummary[]>(`/posts/${encodeURIComponent(slug)}/related`, {
    query: { locale, limit },
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

export function adminListTags() {
  return apiFetch<AdminTag[]>('/admin/tags', { auth: 'required' });
}

export function adminCreateTag(input: TagInput) {
  return apiFetch<AdminTag>('/admin/tags', { method: 'POST', body: input, auth: 'required' });
}

export function adminUpdateTag(id: string, input: Partial<TagInput>) {
  return apiFetch<AdminTag>(`/admin/tags/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function adminDeleteTag(id: string) {
  return apiFetch<void>(`/admin/tags/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
