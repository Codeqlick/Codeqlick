'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { reportBrowserError } from '@/components/layout/ErrorReporter';
import { Button } from '@/components/ui/Button';
import styles from './error.module.css';

/**
 * Fallback for the sections without their own error page (client area, admin, web apps): the
 * message, a retry, and the report to Admin → Errors (architecture 4.11).
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Error');
  useEffect(() => reportBrowserError(error), [error]);

  return (
    <main className={styles.page}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.lead}>{t('body')}</p>
      <div className={styles.actions}>
        <Button onClick={reset}>{t('retry')}</Button>
        <Button href="/" variant="outline">
          {t('home')}
        </Button>
      </div>
    </main>
  );
}
