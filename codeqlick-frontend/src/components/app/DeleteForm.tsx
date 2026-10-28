import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ActionForm, FormCheckbox, FormInput, type FormAction } from './ActionForm';
import styles from './app.module.css';

/**
 * "Danger zone" panel: a required confirmation checkbox (or, with `confirmText`, that text typed:
 * the action checks it with `unconfirmedDelete`) plus a delete button (works without JS).
 */
export async function DeleteForm({
  action,
  title,
  body,
  confirmText,
  label,
}: {
  action: FormAction;
  title: string;
  body: string;
  confirmText?: string;
  /** The button's label (default "Eliminar"). */
  label?: string;
}) {
  const t = await getTranslations('Common');

  return (
    <section className={`${styles.panel} ${styles.dangerPanel}`}>
      <h2 className={styles.panelTitle}>{title}</h2>
      <ActionForm action={action} className={styles.form}>
        <p className={styles.muted}>{body}</p>
        {confirmText ? (
          <FormInput
            id="confirm"
            name="confirm"
            label={t('confirmType', { text: confirmText })}
            autoComplete="off"
            spellCheck={false}
            required
          />
        ) : (
          <FormCheckbox name="confirm" label={t('confirmDelete')} required />
        )}
        <div className={styles.actions}>
          <SubmitButton variant="danger" pendingLabel={t('deleting')}>
            {label ?? t('delete')}
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
