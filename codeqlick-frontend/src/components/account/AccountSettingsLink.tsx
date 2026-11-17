import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { accountUrl } from '@/lib/account-links';

/**
 * "Account settings" at the end of an app's own settings page (decision 108): the account's
 * name, password, sessions and emails live on the account site; the app keeps its own settings.
 */
export async function AccountSettingsLink({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  return (
    <p>
      <a href={accountUrl(locale)}>{t('settingsLink')} →</a>
    </p>
  );
}
