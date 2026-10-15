import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetPost } from '@/lib/api/posts';
import type { AdminPost } from '@/lib/api/types';
import { deletePostAction, updatePostAction } from '../actions';
import { PostForm } from '../PostForm';

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.posts' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tp = await getTranslations({ locale, namespace: 'Admin.preview' });

  let post: AdminPost;
  try {
    post = await adminGetPost(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('edit')}
        back={{ href: '/admin/posts', label: t('back') }}
        actions={
          <>
            <Button href={`/admin/posts/${post.id}/preview`} variant="outline" size="sm">
              {tp('button')}
            </Button>
            {post.status === 'PUBLISHED' ? (
              <Button href={`/blog/${post.slug}`} variant="outline" size="sm">
                {tc('view')}
              </Button>
            ) : null}
          </>
        }
      />
      <section className={styles.panel}>
        <PostForm
          locale={locale}
          action={updatePostAction.bind(null, locale, post.id)}
          post={post}
        />
      </section>
      <DeleteForm
        action={deletePostAction.bind(null, locale, post.id)}
        title={t('deleteTitle')}
        body={t('deleteBody')}
      />
    </div>
  );
}
