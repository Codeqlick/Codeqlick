import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import type { AppLocale } from '@/i18n/routing';
import { PortalFrame } from './PortalFrame';
import styles from './neoqlick.module.css';

/**
 * The 404 of every Neoqlick host (architecture 4.18): the portal's frame and the usual message,
 * never the website's header and footer. `account` shows the header's account link.
 */
export async function NeoqlickNotFound({
  locale,
  account = true,
}: {
  locale: AppLocale;
  account?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'NotFound' });
  return (
    <PortalFrame locale={locale} account={account}>
      <section className={styles.notFound}>
        <title>{t('metaTitle')}</title>
        <p className={styles.sectionEyebrow}>{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p>{t('body')}</p>
        <Button href="/">{t('cta')}</Button>
      </section>
    </PortalFrame>
  );
}
