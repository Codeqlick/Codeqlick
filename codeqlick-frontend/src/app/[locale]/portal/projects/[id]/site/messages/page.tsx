import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { listSiteMessages } from '@/lib/api/portal-site';
import { formatDateTime, parsePage } from '@/lib/format';
import { deleteSiteMessageAction } from '../actions';
import list from './messages.module.css';

/**
 * The messages the client's website form kept (architecture 8.2, decision 31): newest first, to
 * answer by email or phone and delete.
 */
export default async function SiteMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'SiteMessages' });
  const page = parsePage((await searchParams).page);
  const messages = await listSiteMessages(id, { page, pageSize: 20 }).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        back={{ href: `/portal/projects/${id}/site`, label: t('back') }}
      />
      {messages.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <>
          <ol className={list.list}>
            {messages.items.map((item) => (
              <li key={item.id} className={`${styles.panel} ${list.message}`}>
                <header className={list.head}>
                  <h2 className={list.name}>{item.name}</h2>
                  <time className={styles.muted} dateTime={item.createdAt}>
                    {formatDateTime(item.createdAt, locale)}
                  </time>
                </header>
                <p className={list.contact}>
                  <a href={`mailto:${item.email}`}>{item.email}</a>
                  {item.phone ? (
                    <a href={`tel:${item.phone.replace(/[^\d+]/g, '')}`}>{item.phone}</a>
                  ) : null}
                </p>
                <p className={styles.prewrap}>{item.message}</p>
                <div className={list.actions}>
                  <a
                    className={list.reply}
                    href={`mailto:${item.email}?subject=${encodeURIComponent(t('replySubject'))}`}
                  >
                    {t('reply')}
                    <span className="visually-hidden"> — {item.name}</span>
                  </a>
                  <details className={styles.commentForm}>
                    <summary>
                      {t('delete')}
                      <span className="visually-hidden"> — {item.name}</span>
                    </summary>
                    <ActionForm
                      action={deleteSiteMessageAction.bind(null, locale, id, item.id)}
                      className={styles.form}
                    >
                      <p className={styles.muted}>{t('deleteBody')}</p>
                      <div className={styles.actions}>
                        <SubmitButton variant="danger" size="sm" pendingLabel={t('deleting')}>
                          {t('deleteConfirm')}
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                </div>
              </li>
            ))}
          </ol>
          <Pagination
            page={messages.page}
            totalPages={messages.totalPages}
            pathname={`/portal/projects/${id}/site/messages`}
          />
        </>
      )}
      <p className={styles.muted}>{t('kept')}</p>
    </div>
  );
}
