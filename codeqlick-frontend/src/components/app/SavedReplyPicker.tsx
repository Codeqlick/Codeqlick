'use client';

import { useRef } from 'react';
import type { SavedReply } from '@/lib/api/types';
import fieldStyles from '@/components/ui/Field.module.css';
import styles from './app.module.css';

/**
 * "Insert a saved reply" menu for a textarea in the same form: the chosen text goes in at the
 * cursor, with `{name}` and `{project}` filled in. Without saved replies it renders nothing.
 */
export function SavedReplyPicker({
  target,
  replies,
  values,
  label,
  placeholder,
}: {
  /** `name` of the textarea in the same form. */
  target: string;
  replies: Pick<SavedReply, 'id' | 'title' | 'body'>[];
  values: { name?: string; project?: string };
  label: string;
  placeholder: string;
}) {
  const select = useRef<HTMLSelectElement>(null);
  if (replies.length === 0) return null;

  function insert(id: string) {
    const reply = replies.find((item) => item.id === id);
    const textarea = select.current
      ?.closest('form')
      ?.querySelector<HTMLTextAreaElement>(`textarea[name="${target}"]`);
    if (!reply || !textarea) return;
    const text = reply.body
      .replaceAll('{name}', values.name ?? '')
      .replaceAll('{project}', values.project ?? '');
    const { value, selectionStart, selectionEnd } = textarea;
    textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    const caret = selectionStart + text.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    // Setting `value` fires no event: tell listeners (the live preview) it changed.
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    if (select.current) select.current.value = '';
  }

  return (
    <label className={styles.replyPicker}>
      <span className="visually-hidden">{label}</span>
      <select
        ref={select}
        defaultValue=""
        className={fieldStyles.control}
        onChange={(event) => insert(event.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {replies.map((reply) => (
          <option key={reply.id} value={reply.id}>
            {reply.title}
          </option>
        ))}
      </select>
    </label>
  );
}
