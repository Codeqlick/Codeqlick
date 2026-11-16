'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, useTransition } from 'react';
import type { MediaActionResult } from '@/app/[locale]/cruising/actions';
import { compressPhoto } from '@/components/swipe/compress';
import styles from './CruisingMedia.module.css';

type VerificationUploadProps = {
  /** The Server Action that sends the photo. */
  action: (formData: FormData) => Promise<MediaActionResult>;
  submitLabel: string;
};

/** Picks the verification photo, shrinks it in the browser and sends it. */
export function VerificationUpload({ action, submitLabel }: VerificationUploadProps) {
  const t = useTranslations('Cruising.verification');
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(chosen: File | undefined) {
    setMessage(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(chosen ?? null);
    setPreview(chosen ? URL.createObjectURL(chosen) : null);
  }

  function send() {
    if (!file) return;
    startTransition(async () => {
      let small: File;
      try {
        small = await compressPhoto(file);
      } catch {
        setMessage({ ok: false, text: t('errors.invalid') });
        return;
      }
      const form = new FormData();
      form.set('file', small);
      const result = await action(form);
      if (result.ok) {
        setMessage({ ok: true, text: t('sent') });
        pick(undefined);
        if (input.current) input.current.value = '';
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  }

  return (
    <div className={styles.upload}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {t('fileLabel')}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => pick(event.target.files?.[0])}
        className={styles.file}
      />
      {preview ? (
        // A local preview (blob: URL): next/image can't optimise it.
        // oxlint-disable-next-line nextjs/no-img-element
        <img src={preview} alt={t('preview')} className={styles.preview} />
      ) : null}
      <button type="button" className={styles.send} onClick={send} disabled={!file || pending}>
        {pending ? t('sending') : submitLabel}
      </button>
      {message ? (
        <output className={message.ok ? styles.ok : styles.error}>{message.text}</output>
      ) : null}
    </div>
  );
}
