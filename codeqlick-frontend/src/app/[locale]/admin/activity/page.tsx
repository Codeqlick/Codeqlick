import { getTranslations } from 'next-intl/server';
import { ActivityList } from '@/components/app/ActivityList';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { resolveLocale } from '@/i18n/locale';
import { adminListActivity } from '@/lib/api/activity';
import { ACTIVITY_TARGETS, type ActivityTarget } from '@/lib/api/types';
import { firstParam, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminActivityPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.activity' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const query = await searchParams;
  const rawType = firstParam(query.type);
  const type = ACTIVITY_TARGETS.find((value) => value === rawType) as ActivityTarget | undefined;
  const activity = await adminListActivity({ targetType: type, page: parsePage(query.page) });

  return (
    <>
      <PageHeader title={t('title')} lead={t('lead')} />

      <form method="get" className={styles.filters}>
        <Select
          name="type"
          label={t('type')}
          placeholder={tc('all')}
          options={ACTIVITY_TARGETS.map((value) => ({ value, label: t(`types.${value}`) }))}
          defaultValue={type ?? ''}
        />
        <button type="submit" className={buttonClassName({ variant: 'outline' })}>
          {tc('filter')}
        </button>
      </form>

      {activity.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <section className={styles.panel}>
            <ActivityList entries={activity.items} locale={locale} />
          </section>
          <Pagination
            page={activity.page}
            totalPages={activity.totalPages}
            pathname="/admin/activity"
            query={{ type }}
          />
        </>
      )}
    </>
  );
}
