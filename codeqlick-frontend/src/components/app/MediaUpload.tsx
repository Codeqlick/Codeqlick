'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { clearFileInput, FilePicker } from '@/components/ui/FilePicker';
import { useRouter } from '@/i18n/navigation';
import type { ImageFieldLabels } from './ImageField';
import styles from './ImageField.module.css';

type UploadResult = { url: string } | { error: string };

/** Upload control of the media library: sends one image and reloads the list. */
export function MediaUpload({
  upload,
  maxBytes,
  labels,
}: {
  upload: (formData: FormData) => Promise<UploadResult>;
  maxBytes: number;
  labels: ImageFieldLabels;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
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
      clearFileInput(fileInput.current);
      router.refresh();
    });
  }

  return (
    <div className={styles.wrapper}>
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
      <p className={styles.hint}>{labels.hint}</p>
      <p role="alert" className={styles.error}>
        {error}
      </p>
    </div>
  );
}
