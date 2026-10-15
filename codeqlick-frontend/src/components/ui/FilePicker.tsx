'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type DragEvent, type RefObject } from 'react';
import styles from './FilePicker.module.css';

/** Empties a picker's input and lets the picker know (setting `value` fires no event). */
export function clearFileInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.value = '';
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * A file input with the brand's look: a dashed area that opens the browser's picker on click and
 * also takes a dropped file, showing the chosen name. The real input stays in the form (visually
 * hidden but focusable), so it works the same without JavaScript.
 */
export function FilePicker({
  label,
  name,
  accept,
  required,
  disabled,
  inputRef,
}: {
  /** The call to action, e.g. "Choose a file". */
  label: string;
  name?: string;
  accept?: string;
  required?: boolean;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations('Common');
  const id = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownRef;
  const [fileName, setFileName] = useState<string>();
  const [dragging, setDragging] = useState(false);

  // A form reset empties the input without a change event.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => setFileName(undefined);
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [input]);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer.files;
    if (disabled || !input.current || files.length === 0) return;
    const transfer = new DataTransfer();
    transfer.items.add(files[0] as File);
    input.current.files = transfer.files;
    input.current.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return (
    // The drop target wraps the label; clicks and the keyboard go to the label and the input.
    <div
      className={[
        styles.picker,
        dragging ? styles.dragging : '',
        fileName ? styles.chosen : '',
        disabled ? styles.disabled : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        id={id}
        type="file"
        name={name}
        accept={accept}
        required={required}
        disabled={disabled}
        className={styles.input}
        onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name)}
      />
      <label htmlFor={id} className={styles.label}>
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">
            <path
              d="M21 12.5 12.9 20.6a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className={styles.action}>{fileName ? t('changeFile') : label}</span>
        <span id={`${id}-detail`} className={styles.detail} aria-live="polite">
          {fileName ?? t('dropFile')}
        </span>
      </label>
    </div>
  );
}
