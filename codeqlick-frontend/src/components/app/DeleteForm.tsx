import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ActionForm, FormCheckbox, type FormAction } from './ActionForm';
import styles from './app.module.css';

/** "Danger zone" panel: a required confirmation checkbox plus a delete button (works without JS). */
export async function DeleteForm({
  action,
  title,
  body,
}: {
  action: FormAction;
  title: string;
  body: string;
}) {
  const t = await getTranslations('Common');

  return (
    <section className={`${styles.panel} ${styles.dangerPanel}`}>
      <h2 className={styles.panelTitle}>{title}</h2>
      <ActionForm action={action} className={styles.form}>
        <p className={styles.muted}>{body}</p>
        <FormCheckbox name="confirm" label={t('confirmDelete')} required />
        <div className={styles.actions}>
          <SubmitButton variant="danger" pendingLabel={t('deleting')}>
            {t('delete')}
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
