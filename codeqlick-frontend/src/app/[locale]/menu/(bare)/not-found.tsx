import { getLocale } from 'next-intl/server';
import { MenuUnavailable } from '@/components/menu/MenuUnavailable';
import { localeOrDefault } from '@/i18n/locale';
import styles from './bare.module.css';

/**
 * A menu that doesn't exist, is paused or is suspended: one neutral 404. (The root layout has no
 * `<html>`, so Next.js draws this boundary in the browser; the server's own 404 for unknown
 * addresses on the menu host shows the same page, see `AppNotFound`.)
 */
export default async function MenuNotAvailable() {
  return (
    <main className={styles.page}>
      <MenuUnavailable locale={localeOrDefault(await getLocale())} />
    </main>
  );
}
