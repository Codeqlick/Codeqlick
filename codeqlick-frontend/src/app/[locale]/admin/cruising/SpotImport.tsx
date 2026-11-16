'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import styles from '@/components/app/app.module.css';
import { Alert } from '@/components/ui/Alert';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import {
  SPOT_IMPORT_MAX_BYTES,
  spotImportFormat,
  type CruisingSpotType,
  type SpotImportState,
} from '@/lib/cruising';
import admin from './cruising-admin.module.css';

type Props = {
  action: (state: SpotImportState, formData: FormData) => Promise<SpotImportState>;
  /** The spot types' labels, in the page's language. */
  typeLabels: Record<CruisingSpotType, string>;
};

const initial: SpotImportState = { status: 'idle' };

/**
 * The import of Admin → Cruising → Add spots (decision 84): a CSV or GeoJSON file, "Check" (the
 * API's dry run: the rows it would create and those it would skip, with why) and then "Import".
 * The form is sent by hand, not as a form action, so React doesn't clear the chosen file between
 * the check and the import.
 */
export function SpotImport({ action, typeLabels }: Props) {
  const t = useTranslations('CruisingSpotImport');
  const [state, dispatch, pending] = useActionState(action, initial);
  const [fileName, setFileName] = useState('');
  const [format, setFormat] = useState('');
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  /** What the last check was for: a change to the file or the options asks for a new one. */
  const [checked, setChecked] = useState<string | null>(null);
  const [publish, setPublish] = useState(true);
  const current = `${fileName}|${format}|${publish}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    if (formData.get('intent') !== 'import') setChecked(current);
    startTransition(() => dispatch(formData));
  }

  const detected = fileName ? spotImportFormat(fileName, format) : null;
  const result = state.result;
  const canImport =
    !pending &&
    state.status === 'success' &&
    state.dryRun === true &&
    checked === current &&
    (result?.items.length ?? 0) > 0;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {state.message ? (
        <Alert tone={state.status === 'success' ? 'success' : 'error'}>{state.message}</Alert>
      ) : null}
      <p className={styles.muted}>{t('importLead')}</p>
      <Input
        id="spot-import-file"
        name="file"
        type="file"
        accept=".csv,.geojson,.json,text/csv,application/geo+json,application/json"
        label={t('file')}
        hint={t('fileHint')}
        error={fileError}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file && file.size > SPOT_IMPORT_MAX_BYTES) {
            setFileError(t('tooBig'));
            event.currentTarget.value = '';
            setFileName('');
            return;
          }
          setFileError(undefined);
          setFileName(file?.name ?? '');
        }}
      />
      <Select
        id="spot-import-format"
        name="format"
        label={t('format')}
        hint={
          detected ? t('formatDetected', { format: t(`formats.${detected}`) }) : t('formatHint')
        }
        value={format}
        onChange={(event) => setFormat(event.currentTarget.value)}
        options={[
          { value: '', label: t('formatAuto') },
          { value: 'csv', label: t('formats.csv') },
          { value: 'geojson', label: t('formats.geojson') },
        ]}
      />
      <Checkbox
        id="spot-import-publish"
        name="publish"
        label={t('publish')}
        hint={t('publishHint')}
        checked={publish}
        onChange={(event) => setPublish(event.currentTarget.checked)}
      />
      <div className={styles.actions}>
        <button
          type="submit"
          name="intent"
          value="check"
          className={buttonClassName({ variant: 'outline', size: 'sm' })}
          disabled={pending || !fileName}
        >
          {pending ? t('working') : t('check')}
        </button>
        <button
          type="submit"
          name="intent"
          value="import"
          className={buttonClassName({ size: 'sm' })}
          disabled={!canImport}
        >
          {state.dryRun && result ? t('importCount', { count: result.items.length }) : t('import')}
        </button>
      </div>
      {result && result.items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={admin.caption}>
              {state.dryRun ? t('toCreate') : t('created')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('row')}</th>
                <th scope="col">{t('name')}</th>
                <th scope="col">{t('type')}</th>
                <th scope="col">{t('place')}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.row}>
                  <td>{item.row}</td>
                  <th scope="row">{item.name}</th>
                  <td>{typeLabels[item.type] ?? item.type}</td>
                  <td>
                    {item.city}, {item.countryCode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result && result.skipped.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={admin.caption}>{t('skipped')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('row')}</th>
                <th scope="col">{t('reason')}</th>
              </tr>
            </thead>
            <tbody>
              {result.skipped.map((item) => (
                <tr key={item.row}>
                  <th scope="row">{item.row}</th>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </form>
  );
}
