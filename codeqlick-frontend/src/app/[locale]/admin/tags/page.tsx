import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { adminListTags } from '@/lib/api/posts';
import { createTagAction, deleteTagAction, updateTagAction } from './actions';

export default async function AdminTagsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.tags' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tags = await adminListTags();

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('newTag')}</h2>
        <ActionForm action={createTagAction.bind(null, locale)} className={styles.form}>
          <div className={styles.tagFields}>
            <FormInput name="nameEs" label={t('nameEs')} required />
            <FormInput name="nameEn" label={t('nameEn')} required />
            <FormInput name="slug" label={t('slug')} hint={t('slugHint')} mono required />
          </div>
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('creating')}>{tc('create')}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {tags.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('existing')}</h2>
          <ul className={styles.files}>
            {tags.map((tag) => (
              <li key={tag.id} className={styles.tagRow}>
                <ActionForm
                  action={updateTagAction.bind(null, locale, tag.id)}
                  className={styles.form}
                >
                  <div className={styles.tagFields}>
                    <FormInput
                      id={`tag-${tag.id}-es`}
                      name="nameEs"
                      label={t('nameEs')}
                      defaultValue={tag.nameEs}
                      required
                    />
                    <FormInput
                      id={`tag-${tag.id}-en`}
                      name="nameEn"
                      label={t('nameEn')}
                      defaultValue={tag.nameEn}
                      required
                    />
                    <FormInput
                      id={`tag-${tag.id}-slug`}
                      name="slug"
                      label={t('slug')}
                      defaultValue={tag.slug}
                      mono
                      required
                    />
                  </div>
                  <div className={styles.actions}>
                    <SubmitButton variant="outline" size="sm" pendingLabel={tc('saving')}>
                      {tc('save')}
                    </SubmitButton>
                    <span className={styles.muted}>{t('postCount', { count: tag.postCount })}</span>
                  </div>
                </ActionForm>
                <ActionForm
                  action={deleteTagAction.bind(null, locale, tag.id)}
                  className={styles.fileDelete}
                >
                  <FormCheckbox
                    id={`confirm-tag-${tag.id}`}
                    name="confirm"
                    label={tc('confirmDelete')}
                    required
                  />
                  <SubmitButton variant="danger" size="sm" pendingLabel={tc('deleting')}>
                    {tc('delete')}
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
