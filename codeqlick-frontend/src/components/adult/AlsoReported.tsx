import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { appNames, hasAlsoReported, type AlsoReportedData } from '@/lib/adult';

/** "Also reported in Swipe · Cruising (2 open)", next to a reported person (architecture 4.16). */
export function AlsoReported({ data }: { data: AlsoReportedData }) {
  const t = useTranslations('AdminAdult');
  if (!hasAlsoReported(data)) return null;
  return (
    <Badge tone="warning">
      {t('alsoReported', { apps: appNames(data.apps), count: data.open })}
    </Badge>
  );
}
