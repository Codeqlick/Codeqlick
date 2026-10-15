'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import styles from './site.module.css';

export default function SiteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Error');

  return (
    <section className={`wrap ${styles.page} ${styles.narrow}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('body')}</p>
      <div className={styles.actions}>
        <Button onClick={reset}>{t('retry')}</Button>
        <Button href="/" variant="outline">
          {t('home')}
        </Button>
      </div>
    </section>
  );
}
