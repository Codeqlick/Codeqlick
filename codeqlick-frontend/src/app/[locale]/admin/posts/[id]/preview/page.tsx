import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { PreviewNotice, previewLanguage } from '@/components/app/PreviewNotice';
import { PostArticle } from '@/components/content/PostArticle';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetPost } from '@/lib/api/posts';
import type { AdminPost } from '@/lib/api/types';

/** Shows the saved version of a post, draft or published, the way the blog renders it. */
export default async function PostPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.preview' });

  let post: AdminPost;
  try {
    post = await adminGetPost(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const translation = previewLanguage(post.translations, (await searchParams).lang, locale);
  if (!translation) notFound();

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} back={{ href: `/admin/posts/${post.id}`, label: t('back') }} />
      <PreviewNotice
        locale={locale}
        basePath={`/admin/posts/${post.id}/preview`}
        shown={translation.locale}
        available={post.translations.map((item) => item.locale)}
        published={post.status === 'PUBLISHED'}
      />
      <section className={styles.panel} lang={translation.locale}>
        <PostArticle
          locale={translation.locale}
          post={{
            ...translation,
            coverImageUrl: post.coverImageUrl,
            publishedAt: post.publishedAt,
          }}
        />
      </section>
    </div>
  );
}
