'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import styles from './ImageField.module.css';

export type ProjectFileUploadLabels = {
  choose: string;
  upload: string;
  /** Contains `{percent}`. */
  uploading: string;
  hint: string;
  uploaded: string;
  tooLarge: string;
  failed: string;
  signedOut: string;
};

type Outcome = 'uploaded' | 'tooLarge' | 'failed' | 'signedOut';

/**
 * Upload form for project files. Without JavaScript it is a plain multipart form posted to the
 * route handler; with it, the same request goes through XMLHttpRequest to show the progress of
 * large files.
 */
export function ProjectFileUpload({
  action,
  maxBytes,
  labels,
}: {
  action: string;
  maxBytes: number;
  labels: ProjectFileUploadLabels;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [percent, setPercent] = useState<number>();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();

  function finish(outcome: Outcome) {
    setPercent(undefined);
    if (outcome === 'uploaded') {
      form.current?.reset();
      setMessage({ tone: 'success', text: labels.uploaded });
      router.refresh();
    } else {
      setMessage({ tone: 'error', text: labels[outcome] });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('file');
    if (!(file instanceof File) || file.size === 0) return;
    if (file.size > maxBytes) {
      setMessage({ tone: 'error', text: labels.tooLarge });
      return;
    }

    const body = new FormData();
    body.set('file', file);
    const request = new XMLHttpRequest();
    request.open('POST', action);
    request.setRequestHeader('Accept', 'application/json');
    request.upload.addEventListener('progress', (progress) => {
      if (progress.lengthComputable) {
        setPercent(Math.round((progress.loaded / progress.total) * 100));
      }
    });
    request.addEventListener('load', () => {
      let outcome: Outcome = 'failed';
      try {
        outcome = (JSON.parse(request.responseText) as { outcome: Outcome }).outcome;
      } catch {
        // Not our JSON (e.g. a proxy error page): reported as a failure.
      }
      finish(outcome);
    });
    request.addEventListener('error', () => finish('failed'));
    setMessage(undefined);
    setPercent(0);
    request.send(body);
  }

  const busy = percent !== undefined;

  return (
    <form
      ref={form}
      method="post"
      encType="multipart/form-data"
      action={action}
      onSubmit={onSubmit}
      className={styles.wrapper}
    >
      <div className={styles.upload}>
        <input
          type="file"
          name="file"
          required
          aria-label={labels.choose}
          className={styles.file}
          disabled={busy}
        />
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          {busy ? labels.uploading.replace('{percent}', String(percent)) : labels.upload}
        </Button>
      </div>
      {busy ? <progress className={styles.progress} max={100} value={percent} /> : null}
      <p className={styles.hint}>{labels.hint}</p>
      <p
        role={message?.tone === 'error' ? 'alert' : 'status'}
        className={message?.tone === 'success' ? styles.success : styles.error}
      >
        {message?.text}
      </p>
    </form>
  );
}
