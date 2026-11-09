'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { compressPhoto } from '@/components/swipe/compress';
import styles from '@/components/app/app.module.css';
import { buttonClassName } from '@/components/ui/buttonStyles';

type AvatarUploadProps = {
  action: (formData: FormData) => Promise<{ ok: true } | { ok: false; message: string }>;
  hasPhoto: boolean;
};

/** Picks a profile photo, shrinks it in the browser and sends it at once. */
export function AvatarUpload({ action, hasPhoto }: AvatarUploadProps) {
  const t = useTranslations('Account.avatar');
  const router = useRouter();
  const id = useId();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function send(file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    setMessage(null);
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
      const result = await action(form);
      input.value = '';
      if (result.ok) {
        setMessage({ ok: true, text: t('saved') });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  }

  return (
    <div className={styles.actions}>
      <label
        htmlFor={id}
        className={buttonClassName({ variant: 'outline', size: 'sm' })}
        aria-disabled={pending}
      >
        {pending ? t('sending') : hasPhoto ? t('change') : t('pick')}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        disabled={pending}
        onChange={(event) => send(event.target.files?.[0], event.target)}
      />
      {message ? (
        <output className={styles.muted} data-error={message.ok ? undefined : true}>
          {message.text}
        </output>
      ) : null}
    </div>
  );
}
