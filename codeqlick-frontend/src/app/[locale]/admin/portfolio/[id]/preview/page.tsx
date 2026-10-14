import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { PreviewNotice, previewLanguage } from '@/components/app/PreviewNotice';
import { CaseStudyArticle } from '@/components/content/CaseStudyArticle';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetPortfolioItem } from '@/lib/api/portfolio';
import type { AdminPortfolioItem } from '@/lib/api/types';

/** Shows the saved version of a case study, draft or published, the way the site renders it. */
export default async function PortfolioPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.preview' });

  let item: AdminPortfolioItem;
  try {
    item = await adminGetPortfolioItem(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const translation = previewLanguage(item.translations, (await searchParams).lang, locale);
  if (!translation) notFound();

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        back={{ href: `/admin/portfolio/${item.id}`, label: t('back') }}
      />
      <PreviewNotice
        locale={locale}
        basePath={`/admin/portfolio/${item.id}/preview`}
        shown={translation.locale}
        available={item.translations.map((entry) => entry.locale)}
        published={item.status === 'PUBLISHED'}
      />
      <section className={styles.panel} lang={translation.locale}>
        <CaseStudyArticle
          locale={translation.locale}
          item={{
            ...translation,
            clientName: item.clientName,
            projectUrl: item.projectUrl,
            coverImageUrl: item.coverImageUrl,
            technologies: item.technologies,
          }}
        />
      </section>
    </div>
  );
}
