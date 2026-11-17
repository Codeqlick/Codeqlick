import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import type { AppLocale } from '@/i18n/routing';
import styles from './site.module.css';

/** Body of the 404 page, shared by the site's not-found boundary, the root 404 and the apps' 404. */
export async function NotFoundContent({
  locale,
  inApp = false,
}: {
  locale: AppLocale;
  /** Inside an app's frame, whose `main` already sets the width and the gutter. */
  inApp?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'NotFound' });

  return (
    <section className={inApp ? styles.narrow : `wrap ${styles.page} ${styles.narrow}`}>
      <title>{t('metaTitle')}</title>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('body')}</p>
      <div className={styles.actions}>
        <Button href="/">{t('cta')}</Button>
      </div>
    </section>
  );
}
