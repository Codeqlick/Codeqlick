'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useFormState } from './ActionForm';
import styles from './app.module.css';

/**
 * Inside the "new release key" form: shows the key the action just made (once; it is stored only
 * hashed) with a copy button and the request a deploy pipeline sends.
 */
export function ReleaseKeyReveal({
  endpoint,
  labels,
}: {
  /** `https://api…/v1/releases`. */
  endpoint: string;
  labels: { copy: string; copied: string; example: string };
}) {
  const key = useFormState().values?.releaseKey;
  const [copied, setCopied] = useState(false);
  if (!key) return null;

  const example = [
    `curl -X POST ${endpoint} \\`,
    `  -H 'Authorization: Bearer ${key}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"version":"v1.2.0","environment":"STAGING","url":"https://…","title":"…","body":"…","notifyClient":true}'`,
  ].join('\n');

  return (
    <div className={styles.stack}>
      <div className={styles.actions}>
        <code className={styles.secret}>{key}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(key).then(() => setCopied(true));
          }}
        >
          {copied ? labels.copied : labels.copy}
        </Button>
      </div>
      <p className={styles.muted}>{labels.example}</p>
      <pre className={styles.code}>{example}</pre>
    </div>
  );
}
