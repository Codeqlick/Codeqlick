'use server';

import { redirect } from 'next/navigation';
import { logout } from '@/lib/api/auth';
import { localeOrDefault } from '@/i18n/locale';
import { clearAuthCookies, getTokens } from './session';

/** POST /auth/logout with the refresh token (best effort), clear cookies, go home. */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));

  const { refreshToken } = await getTokens();
  if (refreshToken) {
    try {
      await logout(refreshToken);
    } catch {
      // The session may already be revoked or expired; clearing cookies is what matters.
    }
  }
  await clearAuthCookies();
  redirect(`/${locale}`);
}
