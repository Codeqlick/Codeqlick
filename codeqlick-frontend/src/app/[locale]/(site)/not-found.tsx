import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import styles from './site.module.css';

export default async function NotFound() {
  const t = await getTranslations('NotFound');

  return (
    <section className={`wrap ${styles.page} ${styles.narrow}`}>
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
