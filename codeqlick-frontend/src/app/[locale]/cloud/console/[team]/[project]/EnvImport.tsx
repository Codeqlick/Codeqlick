'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, type ChangeEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Checkbox, Input, Textarea } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ENV_IMPORT_MAX_BYTES, type EnvImportState } from '@/lib/cloud';
import styles from '../../../cloud.module.css';

type Props = {
  action: (state: EnvImportState, formData: FormData) => Promise<EnvImportState>;
};

const initial: EnvImportState = { status: 'idle' };

/**
 * "Import .env" (architecture 4.13): a textarea, or a file read here in the browser (only its text
 * is sent, as `content`), the targets and "Replace existing". Shows the keys, never the values.
 */
export function EnvImport({ action }: Props) {
  const t = useTranslations('Cloud.git.import');
  const [content, setContent] = useState('');
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [state, formAction] = useActionState(
    async (previous: EnvImportState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.status === 'success') setContent('');
      return next;
    },
    initial,
  );

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > ENV_IMPORT_MAX_BYTES) {
      setFileError(t('tooBig'));
      input.value = '';
      return;
    }
    setFileError(undefined);
    try {
      setContent(await file.text());
    } catch {
      setFileError(t('unreadable'));
    }
    input.value = '';
  }

  const groups = [
    { label: t('created'), keys: state.created ?? [] },
    { label: t('updated'), keys: state.updated ?? [] },
    { label: t('skipped'), keys: state.skipped ?? [] },
  ].filter((group) => group.keys.length > 0);

  return (
    <details>
      <summary className={styles.small}>{t('title')}</summary>
      <form action={formAction} className={styles.form} noValidate>
        <p className={styles.small}>{t('lead')}</p>
        {state.message ? (
          <Alert tone={state.status === 'success' ? 'success' : 'error'}>{state.message}</Alert>
        ) : null}
        {state.lineErrors && state.lineErrors.length > 0 ? (
          <ul className={styles.list}>
            {state.lineErrors.map((error, index) => (
              <li key={`${error.line ?? 'file'}-${index}`} className={styles.small}>
                {error.line === null ? null : (
                  <span className={styles.mono}>{t('line', { line: error.line })} </span>
                )}
                {error.key ? <span className={styles.mono}>{error.key}: </span> : null}
                {error.message}
              </li>
            ))}
          </ul>
        ) : null}
        {groups.map((group) => (
          <div key={group.label}>
            <p className={styles.small}>{group.label}</p>
            <p className={styles.mono}>{group.keys.join(', ')}</p>
          </div>
        ))}
        <Input
          id="env-import-file"
          type="file"
          accept=".env,text/plain"
          label={t('file')}
          hint={t('fileHint')}
          error={fileError}
          onChange={readFile}
        />
        <Textarea
          id="env-import-content"
          name="content"
          label={t('content')}
          hint={t('contentHint')}
          error={state.fieldErrors?.content}
          value={content}
          onChange={(event) => setContent(event.currentTarget.value)}
          rows={8}
          placeholder={'API_URL=https://api.example.com\nSECRET_KEY="…"'}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          mono
        />
        <Checkbox
          id="env-import-production"
          name="production"
          label={t('production')}
          error={state.fieldErrors?.production}
          defaultChecked
        />
        <Checkbox id="env-import-preview" name="preview" label={t('preview')} defaultChecked />
        <Checkbox
          id="env-import-overwrite"
          name="overwrite"
          label={t('overwrite')}
          hint={t('overwriteHint')}
        />
        <div className={styles.actions}>
          <SubmitButton variant="outline" pendingLabel={t('importing')}>
            {t('submit')}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
