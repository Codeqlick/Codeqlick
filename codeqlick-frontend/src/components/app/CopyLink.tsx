'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './app.module.css';

/** A link shown in full with a button that copies it. */
export function CopyLink({
  url,
  labels,
}: {
  url: string;
  labels: { copy: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.actions}>
      <code className={styles.secret}>{url}</code>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => setCopied(true));
        }}
      >
        {copied ? labels.copied : labels.copy}
      </Button>
    </div>
  );
}
