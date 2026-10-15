import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { resolveLocale } from '@/i18n/locale';
import { createPostAction } from '../actions';
import { PostForm } from '../PostForm';

export default async function NewPostPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.posts' });

  return (
    <>
      <PageHeader title={t('new')} back={{ href: '/admin/posts', label: t('back') }} />
      <section className={styles.panel}>
        <PostForm locale={locale} action={createPostAction.bind(null, locale)} />
      </section>
    </>
  );
}
