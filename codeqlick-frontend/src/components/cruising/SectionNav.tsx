'use client';

import { useEffect, useState } from 'react';
import styles from './CruisingProfile.module.css';

export type SectionNavItem = {
  /** The id of the section on the page (the link's anchor). */
  id: string;
  label: string;
  /** A count shown next to the label (reviews, spots…), when it has one. */
  count?: number;
};

/**
 * The sticky sub-nav of a profile page's sections (architecture 4.15, "Profile pages"): plain
 * anchor links that work without JavaScript; with it, the section being read is marked
 * (`aria-current`) as the page scrolls.
 */
export function SectionNav({ label, items }: { label: string; items: SectionNavItem[] }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => node !== null);
    if (sections.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        // The first section (in the page's order) still in view.
        const first = sections.find((section) => visible.has(section.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: '-20% 0px -55% 0px' },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className={styles.subnav} aria-label={label}>
      <ul className={styles.subnavList}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={styles.subnavLink}
              aria-current={current === item.id ? 'true' : undefined}
              onClick={() => setCurrent(item.id)}
            >
              {item.label}
              {item.count === undefined ? null : <span className={styles.count}>{item.count}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
