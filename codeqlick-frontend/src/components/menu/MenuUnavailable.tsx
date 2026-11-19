import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import styles from './MenuUnavailable.module.css';

/**
 * One neutral page for a menu that doesn't exist, is paused or is suspended (architecture 4.20):
 * it never says why. Also the 404 of any unknown address on the menu host.
 */
export async function MenuUnavailable({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Menu.view' });
  return (
    <div className={styles.unavailable}>
      <h1 className={styles.title}>{t('unavailableTitle')}</h1>
      <p>{t('unavailableBody')}</p>
      <p>
        <Link href="/menu">{t('unavailableLink')}</Link>
      </p>
    </div>
  );
}
