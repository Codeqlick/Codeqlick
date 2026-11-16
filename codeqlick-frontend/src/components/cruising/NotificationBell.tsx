'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { BELL_POLL_MS, bellCount, NOTIFICATIONS_HREF } from '@/lib/cruising-notifications';
import styles from './Cruising.module.css';

type NotificationBellProps = {
  /** The unread count the server rendered. */
  initial: number;
  /** The route handler the bell asks (never the API). */
  endpoint: string;
  className?: string;
};

/**
 * The notification centre's bell (decision 98): the unread count, asked again every minute and on
 * every navigation, while the page is visible.
 */
export function NotificationBell({ initial, endpoint, className }: NotificationBellProps) {
  const t = useTranslations('Cruising.notifications');
  // The last count asked, with the server's count it was asked under: a fresh server count wins.
  const [asked, setAsked] = useState<{ initial: number; unread: number } | null>(null);
  const unread = asked && asked.initial === initial ? asked.unread : initial;
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void fetch(endpoint, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as { unread?: unknown };
          if (active && typeof body.unread === 'number') {
            setAsked({ initial, unread: body.unread });
          }
        })
        .catch(() => {
          // Offline or a hiccup: the next round asks again.
        });
    };
    refresh();
    const timer = setInterval(refresh, BELL_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [endpoint, pathname, initial]);

  const count = bellCount(unread);
  return (
    <Link
      href={NOTIFICATIONS_HREF}
      className={[styles.bell, className].filter(Boolean).join(' ')}
      aria-label={count ? t('bellUnread', { count: unread }) : t('bell')}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path
          d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Zm-2.5 15a2.5 2.5 0 0 0 5 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {count ? (
        <span className={styles.bellCount} aria-hidden="true">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
