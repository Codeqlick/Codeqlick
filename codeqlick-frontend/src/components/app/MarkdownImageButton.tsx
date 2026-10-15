'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './ImageField.module.css';

export type MarkdownImageLabels = {
  insert: string;
  uploading: string;
  choose: string;
  altPlaceholder: string;
  tooLarge: string;
  failed: string;
};

type UploadResult = { url: string } | { error: string };

/**
 * "Insert image" control under a Markdown textarea: uploads a file and writes `![…](url)` at the
 * cursor, with the description placeholder selected so it can be typed over straight away.
 */
export function MarkdownImageButton({
  target,
  upload,
  maxBytes,
  labels,
}: {
  /** `name` of the textarea in the same form. */
  target: string;
  upload: (formData: FormData) => Promise<UploadResult>;
  maxBytes: number;
  labels: MarkdownImageLabels;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function insert(url: string) {
    const textarea = wrapper.current
      ?.closest('form')
      ?.querySelector<HTMLTextAreaElement>(`textarea[name="${target}"]`);
    if (!textarea) return;
    const { value, selectionStart, selectionEnd } = textarea;
    // Images are block content in Markdown: keep them on their own line.
    const before = value.slice(0, selectionStart);
    const lead =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const markdown = `${lead}![${labels.altPlaceholder}](${url})\n\n`;
    textarea.value = before + markdown + value.slice(selectionEnd);
    // Setting `value` fires no event: tell listeners (the live preview) it changed.
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const altStart = selectionStart + lead.length + 2;
    textarea.focus();
    textarea.setSelectionRange(altStart, altStart + labels.altPlaceholder.length);
  }

  function onFileChosen() {
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
      if (fileInput.current) fileInput.current.value = '';
      if ('error' in result) {
        setError(result.error);
        return;
      }
      insert(result.url);
    });
  }

  return (
    <div ref={wrapper} className={styles.wrapper}>
      <div className={styles.upload}>
        {/* No `name`: the file is never sent with the surrounding form. */}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label={labels.choose}
          className={styles.hiddenFile}
          tabIndex={-1}
          onChange={onFileChosen}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
        >
          {pending ? labels.uploading : labels.insert}
        </Button>
      </div>
      <p role="alert" className={styles.error}>
        {error}
      </p>
    </div>
  );
}
