import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { SharedAccess } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { ActionForm, type FormAction } from './ActionForm';
import { AccessReveal } from './AccessReveal';
import styles from './app.module.css';

/**
 * The access shared for a project, never with its secret. The portal passes `deleteAction`; the
 * admin panel `revealAction` too (the secret shows once, in place).
 */
export async function SharedAccessList({
  items,
  locale,
  deleteAction,
  revealAction,
}: {
  items: SharedAccess[];
  locale: AppLocale;
  deleteAction?: (id: string) => FormAction;
  revealAction?: (id: string) => FormAction;
}) {
  const t = await getTranslations({ locale, namespace: 'Access' });
  if (items.length === 0) return <p className={styles.muted}>{t('empty')}</p>;
  return (
    <ul className={styles.files}>
      {items.map((item) => (
        <li key={item.id} className={styles.fileRow}>
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{item.label}</span>
            {item.username || item.url ? (
              <span>
                {item.username ?? ''}
                {item.username && item.url ? ' · ' : ''}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.url}
                  </a>
                ) : null}
              </span>
            ) : null}
            <span className={styles.muted}>
              {t('sharedBy', {
                name: item.createdBy.name,
                date: formatDateTime(item.createdAt, locale),
              })}
              {' · '}
              {item.viewedAt
                ? t('viewedAt', { date: formatDateTime(item.viewedAt, locale) })
                : t('notViewed')}
            </span>
            {revealAction ? (
              <ActionForm action={revealAction(item.id)}>
                <AccessReveal
                  labels={{ copy: t('copy'), copied: t('copied'), notes: t('notes') }}
                />
                <SubmitButton variant="outline" size="sm" pendingLabel={t('revealing')}>
                  {t('reveal')}
                  <span className="visually-hidden"> — {item.label}</span>
                </SubmitButton>
              </ActionForm>
            ) : null}
          </div>
          {deleteAction ? (
            <ActionForm action={deleteAction(item.id)}>
              <SubmitButton variant="ghost" size="sm" pendingLabel={t('deleting')}>
                {t('delete')}
                <span className="visually-hidden"> — {item.label}</span>
              </SubmitButton>
            </ActionForm>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
