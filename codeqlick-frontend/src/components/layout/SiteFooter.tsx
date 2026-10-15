import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { Logo } from '@/components/brand/Logo';
import { Link } from '@/i18n/navigation';
import { legalOwner } from '@/lib/env';
import { SOCIAL_LINKS } from '@/lib/site';
import styles from './SiteFooter.module.css';

export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Footer' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  // Server Component: rendered once per request (or per revalidation), never re-rendered.
  // oxlint-disable-next-line react/purity
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.inner}`}>
        <Logo href="/" size="sm" label={tc('homeLabel')} />
        <p>{tc('tagline')}</p>
        <ul className={styles.social} aria-label={t('social')}>
          {SOCIAL_LINKS.map((link) => (
            <li key={link.name}>
              <a className={styles.pill} href={link.href} rel="noopener noreferrer" target="_blank">
                {link.name}
              </a>
            </li>
          ))}
        </ul>
        <div className={styles.meta}>
          <p>{t('copyright', { year })}</p>
          {legalOwner ? (
            <>
              <Link href="/legal" className={styles.login}>
                {t('legal')}
              </Link>
              <Link href="/privacy" className={styles.login}>
                {t('privacy')}
              </Link>
            </>
          ) : null}
          <Link href="/login" className={styles.login}>
            {t('login')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
