import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { resolveLocale } from '@/i18n/locale';
import { createPortfolioAction } from '../actions';
import { PortfolioForm } from '../PortfolioForm';

export default async function NewPortfolioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.portfolio' });

  return (
    <>
      <PageHeader title={t('new')} back={{ href: '/admin/portfolio', label: t('back') }} />
      <section className={styles.panel}>
        <PortfolioForm locale={locale} action={createPortfolioAction.bind(null, locale)} />
      </section>
    </>
  );
}
