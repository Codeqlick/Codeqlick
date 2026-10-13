import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetPortfolioItem } from '@/lib/api/portfolio';
import type { AdminPortfolioItem } from '@/lib/api/types';
import { deletePortfolioAction, updatePortfolioAction } from '../actions';
import { PortfolioForm } from '../PortfolioForm';

export default async function EditPortfolioPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.portfolio' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  let item: AdminPortfolioItem;
  try {
    item = await adminGetPortfolioItem(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('edit')}
        back={{ href: '/admin/portfolio', label: t('back') }}
        actions={
          item.status === 'PUBLISHED' ? (
            <Button href={`/work/${item.slug}`} variant="outline" size="sm">
              {tc('view')}
            </Button>
          ) : undefined
        }
      />
      <section className={styles.panel}>
        <PortfolioForm
          locale={locale}
          action={updatePortfolioAction.bind(null, locale, item.id)}
          item={item}
        />
      </section>
      <DeleteForm
        action={deletePortfolioAction.bind(null, locale, item.id)}
        title={t('deleteTitle')}
        body={t('deleteBody')}
      />
    </div>
  );
}
