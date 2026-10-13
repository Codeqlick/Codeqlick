import NextLink from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';
import { MobileNav } from './MobileNav';
import styles from './SiteHeader.module.css';

export async function SiteHeader({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Nav' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  // `/#services` must stay a same-page hash link on the home page, so it is built by hand.
  const servicesHref = `/${locale}#services`;
  const links = [
    { href: '/work', label: t('work') },
    { href: '/blog', label: t('blog') },
    { href: '/contact', label: t('contact') },
  ];

  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.inner}`}>
        <Logo href="/" label={tc('homeLabel')} />
        <nav className={styles.nav} aria-label={t('label')}>
          <NextLink href={servicesHref} className={styles.link}>
            {t('services')}
          </NextLink>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={styles.link}>
              {link.label}
            </Link>
          ))}
          <LocaleSwitcher className={styles.desktopOnly} />
          <Button href="/contact" size="sm">
            {t('startProject')}
          </Button>
          <MobileNav
            labels={{ open: t('openMenu'), close: t('closeMenu'), menu: t('menu') }}
            items={[{ href: servicesHref, label: t('services'), raw: true }, ...links]}
          />
        </nav>
      </div>
    </header>
  );
}
