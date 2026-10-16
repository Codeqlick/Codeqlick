'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useFormState } from './ActionForm';
import styles from './app.module.css';

/** Inside the "show" form: the secret the action just returned, with a copy button. */
export function AccessReveal({
  labels,
}: {
  labels: { copy: string; copied: string; notes: string };
}) {
  const values = useFormState().values;
  const [copied, setCopied] = useState(false);
  const secret = values?.revealedSecret;
  if (!secret) return null;
  return (
    <div className={styles.stack}>
      <div className={styles.actions}>
        <code className={styles.secret}>{secret}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(secret).then(() => setCopied(true));
          }}
        >
          {copied ? labels.copied : labels.copy}
        </Button>
      </div>
      {values?.revealedNotes ? (
        <p className={styles.prewrap}>
          <strong>{labels.notes}:</strong> {values.revealedNotes}
        </p>
      ) : null}
    </div>
  );
}
