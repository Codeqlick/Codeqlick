'use client';

import { useDeferredValue, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import type { TextareaProps } from '@/components/ui/Field';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { FormTextarea } from './ActionForm';
import styles from './MarkdownField.module.css';

export type MarkdownPreviewLabels = {
  show: string;
  hide: string;
  title: string;
  empty: string;
};

/**
 * A Markdown textarea with a live preview next to it (below it on narrow screens), rendered the
 * way the site renders it. The textarea stays uncontrolled: the preview reads it on each input.
 */
export function MarkdownField({
  previewLabels,
  compact = false,
  ...props
}: Omit<TextareaProps, 'error'> & {
  previewLabels: MarkdownPreviewLabels;
  /** Render like the portal's project updates (smaller headings). */
  compact?: boolean;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  // Typing stays responsive in long documents: the preview renders behind the keystrokes.
  const preview = useDeferredValue(text);
  const read = () => wrapper.current?.querySelector('textarea')?.value ?? '';

  return (
    <div className={styles.field}>
      <div
        ref={wrapper}
        className={open ? styles.split : undefined}
        onInput={open ? () => setText(read()) : undefined}
      >
        <FormTextarea {...props} />
        {open ? (
          <section className={styles.preview} aria-label={previewLabels.title}>
            <p className={styles.previewTitle} aria-hidden="true">
              {previewLabels.title}
            </p>
            {preview.trim() === '' ? (
              <p className={styles.empty}>{previewLabels.empty}</p>
            ) : (
              <Markdown compact={compact}>{preview}</Markdown>
            )}
          </section>
        ) : null}
      </div>
      <button
        type="button"
        className={buttonClassName({ variant: 'ghost', size: 'sm', className: styles.toggle })}
        aria-expanded={open}
        onClick={() => {
          if (!open) setText(read());
          setOpen(!open);
        }}
      >
        {open ? previewLabels.hide : previewLabels.show}
      </button>
    </div>
  );
}
