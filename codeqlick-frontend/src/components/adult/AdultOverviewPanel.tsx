import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { AdultUserOverview } from '@/lib/api/adult';
import { formatDateTime } from '@/lib/format';
import { AdultOverviewView, type Translate } from './AdultOverviewView';

/** The panel with its texts and dates in the admin's language. */
export async function AdultOverviewPanel({
  locale,
  data,
}: {
  locale: AppLocale;
  data: AdultUserOverview;
}) {
  const t = await getTranslations({ locale, namespace: 'AdminAdult' });
  const translate: Translate = (key, values) => t(key as never, values as never);
  return (
    <AdultOverviewView data={data} t={translate} date={(iso) => formatDateTime(iso, locale)} />
  );
}
