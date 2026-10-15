'use client';

import { useRef, useState, useTransition } from 'react';
import { FormInput } from '@/components/app/ActionForm';
import { Button } from '@/components/ui/Button';
import { clearFileInput, FilePicker } from '@/components/ui/FilePicker';
import type { InputProps } from '@/components/ui/Field';
import styles from './ImageField.module.css';

export type ImageFieldLabels = {
  choose: string;
  upload: string;
  uploading: string;
  hint: string;
  tooLarge: string;
  failed: string;
};

type UploadResult = { url: string } | { error: string };

/**
 * URL input with an upload control next to it: uploading an image fills in the URL. The file
 * input has no `name`, so the image itself is never sent with the surrounding form.
 */
export function ImageField({
  upload,
  maxBytes,
  labels,
  ...input
}: Omit<InputProps, 'error' | 'type' | 'hint'> & {
  upload: (formData: FormData) => Promise<UploadResult>;
  maxBytes: number;
  labels: ImageFieldLabels;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(
    typeof input.defaultValue === 'string' ? input.defaultValue : '',
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    if (file.size > maxBytes) {
      setError(labels.tooLarge);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('file', file);
      let result: UploadResult;
      try {
        result = await upload(formData);
      } catch {
        // The request never reached the action (e.g. the proxy rejected its size).
        result = { error: labels.failed };
      }
      if ('error' in result) {
        setError(result.error);
        return;
      }
      const urlInput = wrapper.current?.querySelector<HTMLInputElement>('input[type="url"]');
      if (urlInput) urlInput.value = result.url;
      setPreview(result.url);
      clearFileInput(fileInput.current);
    });
  }

  return (
    <div ref={wrapper} className={styles.wrapper}>
      <FormInput {...input} type="url" hint={labels.hint} />
      <div className={styles.upload}>
        <FilePicker
          inputRef={fileInput}
          accept="image/png,image/jpeg,image/webp,image/gif"
          label={labels.choose}
        />
        <Button variant="outline" size="sm" onClick={onUpload} disabled={pending}>
          {pending ? labels.uploading : labels.upload}
        </Button>
      </div>
      <p role="alert" className={styles.error}>
        {error}
      </p>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary URL, shown as typed
        <img src={preview} alt="" className={styles.preview} />
      ) : null}
    </div>
  );
}
