import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { FieldRow, FieldValue, RevisionDiff } from '@/lib/revisions';
import { ActionForm, FormCheckbox, type FormAction } from './ActionForm';
import styles from './app.module.css';
import compare from './RevisionCompare.module.css';

/**
 * A revision of a post or case study next to its current content (decision 72): the fields both
 * languages share, then each language, field by field, with the ones that differ marked.
 */
export async function RevisionCompare({
  locale,
  diff,
  fieldLabel,
}: {
  locale: AppLocale;
  diff: RevisionDiff;
  /** The field's label (its key in the item's admin namespace). */
  fieldLabel: (field: string) => string;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.revisions' });
  const labels = {
    thisVersion: t('thisVersion'),
    current: t('current'),
    changed: t('changed'),
  };

  const sections = [
    { id: 'revision-shared', title: t('shared'), rows: diff.shared },
    ...diff.languages.map((language) => ({
      id: `revision-${language.locale}`,
      title: t(`languages.${language.locale}`),
      rows: language.rows,
    })),
  ];

  return (
    <>
      {sections.map((section) => (
        <section key={section.id} className={styles.panel} aria-labelledby={section.id}>
          <h2 id={section.id} className={styles.panelTitle}>
            {section.title}
          </h2>
          <ul className={compare.fields}>
            {section.rows.map((row) => (
              <Field key={row.field} row={row} label={fieldLabel(row.field)} labels={labels} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Field({
  row,
  label,
  labels,
}: {
  row: FieldRow;
  label: string;
  labels: { thisVersion: string; current: string; changed: string };
}) {
  return (
    <li className={row.changed ? `${compare.field} ${compare.changed}` : compare.field}>
      <h3 className={compare.fieldLabel}>
        {label}
        {row.changed ? <span className={compare.changedTag}>{labels.changed}</span> : null}
      </h3>
      <div className={compare.sides}>
        <div className={compare.side}>
          <p className={compare.sideLabel}>{labels.thisVersion}</p>
          <Value kind={row.kind} value={row.revision} />
        </div>
        <div className={compare.side}>
          <p className={compare.sideLabel}>{labels.current}</p>
          <Value kind={row.kind} value={row.current} />
        </div>
      </div>
    </li>
  );
}

function Value({ kind, value }: { kind: FieldRow['kind']; value: FieldValue }) {
  if (value.length === 0) return <p className={compare.empty}>—</p>;
  if (Array.isArray(value)) {
    return (
      <ul className={compare.list}>
        {value.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    );
  }
  if (kind === 'markdown') return <pre className={compare.markdown}>{value}</pre>;
  if (kind === 'image') {
    return (
      <div className={compare.image}>
        {/* oxlint-disable-next-line nextjs/no-img-element -- any URL: uploads or external */}
        <img src={value} alt="" className={compare.thumb} loading="lazy" />
        <span className={compare.url}>{value}</span>
      </div>
    );
  }
  return <p className={compare.text}>{value}</p>;
}

/** "Restore this version", after ticking a confirmation (like DeleteForm). */
export async function RestoreRevisionForm({
  locale,
  action,
  body,
}: {
  locale: AppLocale;
  action: FormAction;
  body: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.revisions' });

  return (
    <section className={styles.panel} aria-labelledby="revision-restore">
      <h2 id="revision-restore" className={styles.panelTitle}>
        {t('restoreTitle')}
      </h2>
      <ActionForm action={action} className={styles.form}>
        <p className={styles.muted}>{body}</p>
        <FormCheckbox name="confirm" label={t('restoreConfirm')} required />
        <div className={styles.actions}>
          <SubmitButton pendingLabel={t('restoring')}>{t('restore')}</SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
