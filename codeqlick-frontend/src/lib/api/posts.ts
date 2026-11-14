import 'server-only';
import { apiFetch } from './client';
import type {
  AdminPost,
  AdminTag,
  ContentRevision,
  Locale,
  Paginated,
  PostDetail,
  PostInput,
  PostRevision,
  PostSummary,
  PublicTag,
  SlugRedirect,
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
  /** Text to look for (title, excerpt, content; case and accents don't matter). */
  q?: string;
}) {
  return apiFetch<Paginated<PostSummary>>('/posts', {
    query: {
      locale: params.locale,
      page: params.page,
      pageSize: params.pageSize,
      tag: params.tag,
      q: params.q,
    },
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

/** The current slug of the live post that `slug` used to name (decision 71); 404 otherwise. */
export function getPostRedirect(slug: string) {
  return apiFetch<SlugRedirect>(`/posts/redirects/${encodeURIComponent(slug)}`, {
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

const revisionsPath = (id: string) => `/admin/posts/${encodeURIComponent(id)}/revisions`;

/** The post's earlier versions, newest first (at most 20). */
export function adminListPostRevisions(id: string) {
  return apiFetch<ContentRevision[]>(revisionsPath(id), { auth: 'required' });
}

export function adminGetPostRevision(id: string, revisionId: string) {
  return apiFetch<PostRevision>(`${revisionsPath(id)}/${encodeURIComponent(revisionId)}`, {
    auth: 'required',
  });
}

/** Puts that version back (the current content becomes a revision). */
export function adminRestorePostRevision(id: string, revisionId: string) {
  return apiFetch<AdminPost>(`${revisionsPath(id)}/${encodeURIComponent(revisionId)}/restore`, {
    method: 'POST',
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
