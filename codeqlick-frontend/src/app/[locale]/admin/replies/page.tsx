import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { adminListSavedReplies } from '@/lib/api/saved-replies';
import { createSavedReplyAction, deleteSavedReplyAction, updateSavedReplyAction } from './actions';

/** Reusable texts for lead replies and project comments. */
export default async function SavedRepliesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.savedReplies' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const replies = await adminListSavedReplies();

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('new')}</h2>
        <ActionForm action={createSavedReplyAction.bind(null, locale)} className={styles.form}>
          <FormInput name="title" label={t('replyTitle')} hint={t('replyTitleHint')} required />
          <FormTextarea name="body" label={t('body')} hint={t('bodyHint')} rows={8} required />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('creating')}>{tc('create')}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('saved', { count: replies.length })}</h2>
        {replies.length === 0 ? (
          <p className={styles.muted}>{t('empty')}</p>
        ) : (
          <ul className={styles.updates}>
            {replies.map((reply) => (
              <li key={reply.id} className={styles.update}>
                <h3 className={styles.updateTitle}>{reply.title}</h3>
                <p className={`${styles.prewrap} ${styles.muted}`}>{reply.body}</p>
                <details className={styles.milestoneEdit}>
                  <summary>{t('editOrDelete')}</summary>
                  <div className={styles.stack}>
                    <ActionForm
                      action={updateSavedReplyAction.bind(null, locale, reply.id)}
                      className={styles.form}
                    >
                      <FormInput
                        id={`reply-${reply.id}-title`}
                        name="title"
                        label={t('replyTitle')}
                        required
                        defaultValue={reply.title}
                      />
                      <FormTextarea
                        id={`reply-${reply.id}-body`}
                        name="body"
                        label={t('body')}
                        rows={8}
                        required
                        defaultValue={reply.body}
                      />
                      <div className={styles.actions}>
                        <SubmitButton size="sm" pendingLabel={tc('saving')}>
                          {tc('save')}
                        </SubmitButton>
                      </div>
                    </ActionForm>
                    <ActionForm
                      action={deleteSavedReplyAction.bind(null, locale, reply.id)}
                      className={styles.fileDelete}
                    >
                      <FormCheckbox
                        id={`reply-${reply.id}-confirm`}
                        name="confirm"
                        label={tc('confirmDelete')}
                        required
                      />
                      <SubmitButton variant="danger" size="sm" pendingLabel={tc('deleting')}>
                        {tc('delete')}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
