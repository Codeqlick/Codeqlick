'use client';

import { useEffect, useRef, useState } from 'react';
import { buttonClassName } from '@/components/ui/buttonStyles';

/** Copies the log shown on the page; the label says "Copied" for two seconds. */
export function CopyLogButton({
  text,
  labels,
}: {
  text: string;
  labels: { copy: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked or unavailable: the download link still works.
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      className={buttonClassName({ variant: 'outline', size: 'sm' })}
      onClick={() => void copy()}
      aria-live="polite"
    >
      {copied ? labels.copied : labels.copy}
    </button>
  );
}
