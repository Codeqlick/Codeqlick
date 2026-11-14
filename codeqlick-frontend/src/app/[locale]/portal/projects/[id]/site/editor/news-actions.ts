'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { NEWS_PAGE_SIZE } from '@/components/editor/news';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import {
  createSiteNews,
  deleteSiteNews,
  listSiteNews,
  publishSiteNews,
  setSiteNewsEnabled,
  unpublishSiteNews,
  updateSiteNews,
  type NewsScope,
  type SiteNewsInput,
} from '@/lib/api/site-news';
import type { SiteNewsBuild, SiteNewsList, SiteNewsPost } from '@/lib/api/types';

/** Why a news call did not work, in the words the section has messages for. */
export type NewsFailure =
  | 'invalid'
  | 'limit'
  | 'expired'
  | 'busy'
  | 'unavailable'
  | 'notFound'
  | 'failed';

/** What the news section gets back: the data (and the build's result), or the problem. */
export type NewsResult<T> =
  | { ok: true; data: T; build?: SiteNewsBuild }
  | { ok: false; reason: NewsFailure; errors: Record<string, string>; message?: string };

const scopeOf = (scope: NewsScope): NewsScope => (scope === 'admin' ? 'admin' : 'portal');

async function attempt<T>(
  locale: AppLocale,
  call: () => Promise<{ data: T; build?: SiteNewsBuild }>,
): Promise<NewsResult<T>> {
  try {
    return { ok: true, ...(await call()) };
  } catch (error) {
    if (!isApiError(error)) return { ok: false, reason: 'failed', errors: {} };
    if (error.status === 401) redirect(`/${locale}/login`);
    const errors = error.fieldErrors;
    const message = error.detail ?? error.title;
    if (error.status === 400) {
      // Past 200 posts the API answers 400 with a message instead of a field.
      const limit = /200|limit/i.test(message) && Object.keys(errors).length === 0;
      return { ok: false, reason: limit ? 'limit' : 'invalid', errors, message };
    }
    if (error.status === 404) return { ok: false, reason: 'notFound', errors };
    if (error.status === 409) return { ok: false, reason: 'expired', errors };
    if (error.status === 429) return { ok: false, reason: 'busy', errors };
    if (error.status === 503) return { ok: false, reason: 'unavailable', errors };
    return { ok: false, reason: 'failed', errors };
  }
}

/** Publishing, unpublishing, deleting and the switch change the live site: refresh the pages. */
function refresh(locale: AppLocale, scope: NewsScope) {
  revalidatePath(`/${locale}/${scope}`, 'layout');
}

/** One more page of the list (page 1 starts it over). */
export async function listNewsAction(
  locale: AppLocale,
  scope: NewsScope,
  projectId: string,
  page: number,
): Promise<NewsResult<SiteNewsList>> {
  return attempt(locale, async () => ({
    data: await listSiteNews(scopeOf(scope), projectId, { page, pageSize: NEWS_PAGE_SIZE }),
  }));
}

export async function createNewsAction(
  locale: AppLocale,
  scope: NewsScope,
  projectId: string,
  input: SiteNewsInput,
): Promise<NewsResult<SiteNewsPost>> {
  return attempt(locale, async () => ({
    data: await createSiteNews(scopeOf(scope), projectId, input),
  }));
}

export async function updateNewsAction(
  locale: AppLocale,
  scope: NewsScope,
  projectId: string,
  postId: string,
  input: SiteNewsInput,
): Promise<NewsResult<SiteNewsPost>> {
  const result = await attempt(locale, async () => {
    const { build, ...post } = await updateSiteNews(scopeOf(scope), projectId, postId, input);
    return { data: post as SiteNewsPost, build };
  });
  if (result.ok && result.data.status !== 'DRAFT') refresh(locale, scope);
  return result;
}

/** Saves what is in the form and then publishes it, so "Publish" never loses an edit. */
export async function publishNewsAction(
  locale: AppLocale,
  scope: NewsScope,
  projectId: string,
  postId: string,
  input: SiteNewsInput | null,
): Promise<NewsResult<SiteNewsPost>> {
  const result = await attempt(locale, async () => {
    if (input) await updateSiteNews(scopeOf(scope), projectId, postId, input);
    const { build, ...post } = await publishSiteNews(scopeOf(scope), projectId, postId);
    return { data: post as SiteNewsPost, build };
  });
  if (result.ok) refresh(locale, scope);
  return result;
}

export async function unpublishNewsAction(
  locale: AppLocale,
  scope: NewsScope,
  projectId: string,
  postId: string,
): Promise<NewsResult<SiteNewsPost>> {
  const result = await attempt(locale, async () => {
    const { build, ...post } = await unpublishSiteNews(scopeOf(scope), projectId, postId);
    return { data: post as SiteNewsPost, build };
  });
  if (result.ok) refresh(locale, scope);
  return result;
}

export async function deleteNewsAction(
  locale: AppLocale,
  scope: NewsScope,
  projectId: string,
  postId: string,
): Promise<NewsResult<null>> {
  const result = await attempt(locale, async () => {
    await deleteSiteNews(scopeOf(scope), projectId, postId);
    return { data: null };
  });
  if (result.ok) refresh(locale, scope);
  return result;
}

export async function setNewsEnabledAction(
  locale: AppLocale,
  scope: NewsScope,
  projectId: string,
  enabled: boolean,
): Promise<NewsResult<{ enabled: boolean }>> {
  const result = await attempt(locale, async () => ({
    data: await setSiteNewsEnabled(scopeOf(scope), projectId, enabled),
  }));
  if (result.ok) refresh(locale, scope);
  return result;
}
