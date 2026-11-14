import 'server-only';
import { apiFetch } from './client';
import type { SiteNewsList, SiteNewsPost, SiteNewsPostResult, SiteNewsStatus } from './types';

/** The client's own routes, or the admin's copy of them for any managed site (architecture 8.2). */
export type NewsScope = 'portal' | 'admin';

/** What a post is saved with; `photo` and `expiresAt` null remove them (`expiresAt`: YYYY-MM-DD). */
export type SiteNewsInput = {
  title: string;
  summary: string;
  body: string;
  photo: string | null;
  expiresAt: string | null;
};

const path = (scope: NewsScope, projectId: string) =>
  `/${scope}/projects/${encodeURIComponent(projectId)}/site`;
const postPath = (scope: NewsScope, projectId: string, postId: string) =>
  `${path(scope, projectId)}/news/${encodeURIComponent(postId)}`;

/** A page of posts, newest first, and whether the section is on; 404 without a managed site. */
export function listSiteNews(
  scope: NewsScope,
  projectId: string,
  query: { status?: SiteNewsStatus; page?: number; pageSize?: number } = {},
) {
  return apiFetch<SiteNewsList>(`${path(scope, projectId)}/news`, { auth: 'required', query });
}

/** Saves a new post as a draft; nothing is built. */
export function createSiteNews(scope: NewsScope, projectId: string, input: SiteNewsInput) {
  return apiFetch<SiteNewsPost>(`${path(scope, projectId)}/news`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** Saves a post; the site is rebuilt when it was published. */
export function updateSiteNews(
  scope: NewsScope,
  projectId: string,
  postId: string,
  input: Partial<SiteNewsInput>,
) {
  return apiFetch<SiteNewsPostResult>(postPath(scope, projectId, postId), {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function deleteSiteNews(scope: NewsScope, projectId: string, postId: string) {
  return apiFetch<void>(postPath(scope, projectId, postId), {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Publishes (409 when its expiry already passed) and rebuilds the site; 503 without a builder. */
export function publishSiteNews(scope: NewsScope, projectId: string, postId: string) {
  return apiFetch<SiteNewsPostResult>(`${postPath(scope, projectId, postId)}/publish`, {
    method: 'POST',
    auth: 'required',
  });
}

export function unpublishSiteNews(scope: NewsScope, projectId: string, postId: string) {
  return apiFetch<SiteNewsPostResult>(`${postPath(scope, projectId, postId)}/unpublish`, {
    method: 'POST',
    auth: 'required',
  });
}

/** Switches the news section on or off; the site is rebuilt. */
export function setSiteNewsEnabled(scope: NewsScope, projectId: string, enabled: boolean) {
  return apiFetch<{ enabled: boolean }>(`${path(scope, projectId)}/news-settings`, {
    method: 'PUT',
    body: { enabled },
    auth: 'required',
  });
}
