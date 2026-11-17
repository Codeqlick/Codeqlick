'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { tabClassName, tabsClassName, type TabsVariant } from './Tabs';

export type TabListItem<T extends string> = {
  value: T;
  label: ReactNode;
  /** The tab's language when it differs from the page's ("English" on a Spanish page). */
  lang?: string;
  /** The panel the tab shows (`aria-controls`). */
  controls?: string;
};

/**
 * Tabs that switch a view in place, without a new address (architecture 6.6): a real `tablist`.
 * Only the selected tab is in the tab order; ← → move to the previous or next tab and select it,
 * Home and End to the first and last.
 */
export function TabList<T extends string>({
  label,
  items,
  value,
  onChange,
  variant = 'segmented',
  className,
}: {
  /** The tab list's accessible name. */
  label: string;
  items: TabListItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: TabsVariant;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].value);
  };

  return (
    <div role="tablist" aria-label={label} className={tabsClassName(variant, className)}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            className={tabClassName}
            aria-selected={selected}
            aria-controls={item.controls}
            tabIndex={selected ? 0 : -1}
            lang={item.lang}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
