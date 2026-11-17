import { isApiError } from '@/lib/api/errors';

/** The API's 403 when an account is barred from the 18+ apps (decision 120). */
const BARRED = /18\+ apps/i;

/**
 * What a refused entry (403) says: the neutral "this account can't use Codeqlick's 18+ apps"
 * when the API says so, otherwise the app's own "only for 18 or over". `t` is the entry form's
 * translator of the app (`onboarding.notAllowed`, `onboarding.underage`).
 */
export function entryRefusal(
  error: unknown,
  t: (key: 'notAllowed' | 'underage') => string,
): string {
  const detail = isApiError(error) ? `${error.detail ?? ''} ${error.title ?? ''}` : '';
  return BARRED.test(detail) ? t('notAllowed') : t('underage');
}
