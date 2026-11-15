import 'server-only';
import { apiFetch } from './client';
import { isApiError } from './errors';

/** The IndexNow key changes only with the API's secret, so an hour of cache is plenty. */
export const INDEXNOW_KEY_REVALIDATE = 3600;

/** What IndexNow accepts as a key: 8 to 128 letters, digits or dashes. */
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/**
 * The IndexNow key (architecture 4.1, IndexNow), public by design. `null` while the API has
 * IndexNow off (404); throws ApiError for anything else, including an unreachable API.
 */
export async function getIndexNowKey(): Promise<string | null> {
  const data = await apiFetch<{ key?: unknown }>('/indexnow/key', {
    revalidate: INDEXNOW_KEY_REVALIDATE,
  }).catch((error: unknown) => {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  });
  const key = data?.key;
  return typeof key === 'string' && KEY_PATTERN.test(key) ? key : null;
}
