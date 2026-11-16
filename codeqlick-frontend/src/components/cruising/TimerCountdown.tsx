'use client';

import { useEffect, useState } from 'react';
import { formatMinutes, minutesLeft } from '@/lib/cruising-safety';
import styles from './CruisingSafety.module.css';

/**
 * The time left on the "Check on me" timer, by the minute. A `timer` role, which screen readers
 * don't announce on every change: the end time is written next to it.
 */
export function TimerCountdown({
  endsAt,
  leftLabel,
  ranOutLabel,
}: {
  endsAt: string;
  /** "{time} left", with `{time}` replaced here. */
  leftLabel: string;
  ranOutLabel: string;
}) {
  const [left, setLeft] = useState(() => minutesLeft(endsAt));

  useEffect(() => {
    const id = window.setInterval(() => setLeft(minutesLeft(endsAt)), 15_000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return (
    <p role="timer" className={styles.countdown} suppressHydrationWarning>
      {left > 0 ? leftLabel.replace('{time}', formatMinutes(left)) : ranOutLabel}
    </p>
  );
}
