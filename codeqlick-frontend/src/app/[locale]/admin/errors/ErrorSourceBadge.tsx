import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import type { AppLocale } from '@/i18n/routing';
import type { ErrorSource } from '@/lib/api/error-reports';

const TONE = { API: 'ink', WEB_SERVER: 'brand', WEB_BROWSER: 'neutral' } as const;

export async function ErrorSourceBadge({
  source,
  locale,
}: {
  source: ErrorSource;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: 'AdminErrors' });
  return <Badge tone={TONE[source]}>{t(`sources.${source}`)}</Badge>;
}
