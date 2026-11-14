import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { RevisionHistory } from '@/components/app/RevisionHistory';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetPortfolioItem, adminListPortfolioRevisions } from '@/lib/api/portfolio';
import { firstParam } from '@/lib/format';
import type { AdminPortfolioItem } from '@/lib/api/types';
import { deletePortfolioAction, updatePortfolioAction } from '../actions';
import { PortfolioForm } from '../PortfolioForm';

export default async function EditPortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ restored?: string | string[] }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.portfolio' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tp = await getTranslations({ locale, namespace: 'Admin.preview' });
  const tr = await getTranslations({ locale, namespace: 'Admin.revisions' });

  let item: AdminPortfolioItem;
  try {
    item = await adminGetPortfolioItem(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const revisions = await adminListPortfolioRevisions(item.id);
  const restored = firstParam((await searchParams).restored) === '1';

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('edit')}
        back={{ href: '/admin/portfolio', label: t('back') }}
        actions={
          <>
            <Button href={`/admin/portfolio/${item.id}/preview`} variant="outline" size="sm">
              {tp('button')}
            </Button>
            {item.status === 'PUBLISHED' ? (
              <Button href={`/work/${item.slug}`} variant="outline" size="sm">
                {tc('view')}
              </Button>
            ) : null}
          </>
        }
      />
      {restored ? <Alert tone="success">{tr('restored')}</Alert> : null}
      <section className={styles.panel}>
        <PortfolioForm
          locale={locale}
          action={updatePortfolioAction.bind(null, locale, item.id)}
          item={item}
        />
      </section>
      <RevisionHistory
        locale={locale}
        revisions={revisions}
        basePath={`/admin/portfolio/${item.id}/revisions`}
      />
      <DeleteForm
        action={deletePortfolioAction.bind(null, locale, item.id)}
        title={t('deleteTitle')}
        body={t('deleteBody')}
      />
    </div>
  );
}
