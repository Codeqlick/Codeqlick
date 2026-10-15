import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { PublishStatusBadge } from '@/components/app/StatusBadges';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListPosts } from '@/lib/api/posts';
import { formatDateTime, isScheduled, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminPostsPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.posts' });
  const ts = await getTranslations({ locale, namespace: 'PublishStatuses' });
  const posts = await adminListPosts({ page: parsePage((await searchParams).page) });
  const newButton = <Button href="/admin/posts/new">{t('new')}</Button>;

  return (
    <>
      <PageHeader title={t('title')} actions={newButton} />
      {posts.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={newButton} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('postTitle')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('updated')}</th>
                </tr>
              </thead>
              <tbody>
                {posts.items.map((post) => (
                  <tr key={post.id}>
                    <th scope="row">
                      <Link href={`/admin/posts/${post.id}`}>
                        {post.translations.find((item) => item.locale === 'en')?.title ?? post.slug}
                      </Link>
                      <span className={styles.sub}>/{post.slug}</span>
                    </th>
                    <td>
                      <PublishStatusBadge
                        status={post.status}
                        scheduled={isScheduled(post)}
                        label={isScheduled(post) ? ts('SCHEDULED') : ts(post.status)}
                      />
                    </td>
                    <td>{formatDateTime(post.updatedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={posts.page} totalPages={posts.totalPages} pathname="/admin/posts" />
        </>
      )}
    </>
  );
}
