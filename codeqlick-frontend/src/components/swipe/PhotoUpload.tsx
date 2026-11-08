'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { UploadResult } from '@/app/[locale]/swipe/actions';
import { compressPhoto } from './compress';
import styles from './Swipe.module.css';

type PhotoUploadProps = {
  /** The Server Action that sends the photo (verification or a normal photo). */
  action: (formData: FormData) => Promise<UploadResult>;
  label: string;
  consentLabel: string;
  submitLabel: string;
};

/** Picks a photo, shows it, shrinks it in the browser and sends it with the consent box. */
export function PhotoUpload({ action, label, consentLabel, submitLabel }: PhotoUploadProps) {
  const t = useTranslations('Swipe.upload');
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
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
        setMessage({ ok: false, text: t('notImage') });
        return;
      }
      const form = new FormData();
      form.set('file', small);
      form.set('consent', consent ? 'on' : '');
      const result = await action(form);
      if (result.ok) {
        setMessage({ ok: true, text: t('sent') });
        pick(undefined);
        setConsent(false);
        if (input.current) input.current.value = '';
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  }

  return (
    <div className={styles.upload}>
      <label htmlFor={id} className={styles.uploadLabel}>
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => pick(event.target.files?.[0])}
        className={styles.fileInput}
      />
      {preview ? (
        // A local preview (blob: URL): next/image can't optimise it.
        // oxlint-disable-next-line nextjs/no-img-element
        <img src={preview} alt={t('preview')} className={styles.preview} />
      ) : null}
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>{consentLabel}</span>
      </label>
      <button
        type="button"
        className={styles.primary}
        onClick={send}
        disabled={!file || !consent || pending}
      >
        {pending ? t('sending') : submitLabel}
      </button>
      {message ? (
        <output className={message.ok ? styles.ok : styles.error}>{message.text}</output>
      ) : null}
    </div>
  );
}
