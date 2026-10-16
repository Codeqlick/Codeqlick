import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { MediaUpload } from '@/components/app/MediaUpload';
import { PageHeader } from '@/components/app/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListMedia, MAX_IMAGE_BYTES } from '@/lib/api/media';
import { formatBytes, formatDateTime, parsePage } from '@/lib/format';
import { absoluteUrl } from '@/lib/seo';
import { deleteImageAction, uploadImageAction } from '../actions';
import mediaStyles from './media.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

/** Media library: every uploaded image with its URL, what uses it and a way to delete it. */
export default async function AdminMediaPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.media' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const media = await adminListMedia({ page: parsePage((await searchParams).page), pageSize: 24 });

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />
      <section className={styles.panel}>
        <MediaUpload
          upload={uploadImageAction.bind(null, locale)}
          maxBytes={MAX_IMAGE_BYTES}
          labels={{
            choose: t('choose'),
            upload: t('upload'),
            uploading: t('uploading'),
            hint: t('uploadHint'),
            tooLarge: t('tooLarge'),
            failed: t('failed'),
          }}
        />
      </section>

      {media.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <ul className={styles.cards}>
            {media.items.map((item) => {
              const url = absoluteUrl(`/media/${item.filename}`);
              return (
                <Card as="li" bordered key={item.filename} className={mediaStyles.item}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by /media */}
                  <img
                    src={`/media/${item.filename}`}
                    alt=""
                    loading="lazy"
                    className={mediaStyles.thumb}
                  />
                  <p className={styles.muted}>
                    {t('uploaded', { date: formatDateTime(item.createdAt, locale) })} ·{' '}
                    {formatBytes(item.size, locale)}
                  </p>
                  <input
                    className={mediaStyles.url}
                    type="text"
                    readOnly
                    value={url}
                    aria-label={t('url')}
                  />
                  {item.usedBy.length > 0 ? (
                    <div>
                      <p className={styles.muted}>{t('usedBy')}</p>
                      <ul className={mediaStyles.usage}>
                        {item.usedBy.map((usage) => (
                          <li key={`${usage.type}-${usage.id}`}>
                            <Link
                              href={
                                usage.type === 'site'
                                  ? `/admin/projects/${usage.id}#site`
                                  : `/admin/${usage.type === 'post' ? 'posts' : 'portfolio'}/${usage.id}`
                              }
                            >
                              {t(usage.type)}: {usage.slug}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <p className={styles.muted}>{t('inUseHint')}</p>
                    </div>
                  ) : (
                    <>
                      <p className={styles.muted}>{t('unused')}</p>
                      <ActionForm
                        action={deleteImageAction.bind(null, locale, item.filename)}
                        className={styles.form}
                      >
                        <FormCheckbox
                          id={`confirm-${item.filename}`}
                          name="confirm"
                          label={tc('confirmDelete')}
                          required
                        />
                        <div className={styles.actions}>
                          <SubmitButton variant="danger" size="sm" pendingLabel={tc('deleting')}>
                            {t('delete')}
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    </>
                  )}
                </Card>
              );
            })}
          </ul>
          <Pagination page={media.page} totalPages={media.totalPages} pathname="/admin/media" />
        </>
      )}
    </div>
  );
}
