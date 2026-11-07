'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './moderation.module.css';

const SHORTCUTS = ['j', 'k', 'x', 'd', 's', 'o', '?'] as const;
type Shortcut = (typeof SHORTCUTS)[number];

/** Typing in a field (a reason, a reply) never triggers a shortcut. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return target.type !== 'checkbox';
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * Keyboard moderation for the reports list (`[data-report]` items): j/k move between reports, x
 * selects one for the bulk actions, d dismisses, s suspends, o opens the person's page, ? shows
 * the keys. Also the "select all" box for the bulk form.
 */
export function ModerationKeys({
  labels,
  form,
}: {
  labels: { title: string; selectAll: string } & Record<Shortcut, string>;
  /** The bulk form's id: the report checkboxes join it. */
  form: string;
}) {
  const [help, setHelp] = useState(false);
  const current = useRef(-1);

  useEffect(() => {
    const reports = () => [...document.querySelectorAll<HTMLElement>('[data-report]')];
    const focus = (index: number) => {
      const items = reports();
      if (items.length === 0) return;
      current.current = Math.max(0, Math.min(items.length - 1, index));
      const item = items[current.current]!;
      item.focus();
      item.scrollIntoView({ block: 'nearest' });
    };
    const active = (): HTMLElement | undefined => {
      const items = reports();
      const focused = items.findIndex((item) => item.contains(document.activeElement));
      if (focused >= 0) current.current = focused;
      return items[current.current];
    };
    const press = (report: HTMLElement | undefined, name: string) =>
      report?.querySelector<HTMLElement>(`[data-shortcut="${name}"]`)?.click();

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;
      const key = event.key.toLowerCase() as Shortcut;
      if (!SHORTCUTS.includes(key)) return;
      event.preventDefault();
      switch (key) {
        case 'j':
          focus(current.current + 1);
          return;
        case 'k':
          focus(current.current - 1);
          return;
        case 'x':
          press(active(), 'select');
          return;
        case 'd':
          press(active(), 'dismiss');
          return;
        case 's':
          press(active(), 'suspend');
          return;
        case 'o':
          press(active(), 'open');
          return;
        case '?':
          setHelp((shown) => !shown);
          return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const selectAll = (checked: boolean) => {
    for (const box of document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][form="${form}"][name="ids"]`,
    )) {
      box.checked = checked;
    }
  };

  return (
    <div className={styles.keys}>
      <label className={styles.selectAll}>
        <input type="checkbox" onChange={(event) => selectAll(event.target.checked)} />
        {labels.selectAll}
      </label>
      <button
        type="button"
        className={styles.keysToggle}
        onClick={() => setHelp((shown) => !shown)}
        aria-expanded={help}
      >
        {labels.title} <kbd>?</kbd>
      </button>
      {help ? (
        <dl className={styles.keyList}>
          {SHORTCUTS.map((key) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{labels[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
