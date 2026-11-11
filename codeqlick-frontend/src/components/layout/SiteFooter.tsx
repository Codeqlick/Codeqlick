import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { Logo } from '@/components/brand/Logo';
import { Link } from '@/i18n/navigation';
import { legalOwner } from '@/lib/env';
import { CONTACT_EMAIL, SOCIAL_LINKS } from '@/lib/site';
import styles from './SiteFooter.module.css';

export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Footer' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tn = await getTranslations({ locale, namespace: 'Nav' });
  const tw = await getTranslations({ locale, namespace: 'BasicWebsite' });
  // Server Component: rendered once per request (or per revalidation), never re-rendered.
  // oxlint-disable-next-line react/purity
  const year = new Date().getFullYear();

  const studio = [
    { href: '/services', label: tn('services') },
    { href: '/work', label: tn('work') },
    { href: '/blog', label: tn('blog') },
    { href: '/apps', label: tn('apps') },
    { href: '/about', label: tn('about') },
    { href: '/contact', label: tn('contact') },
  ];
  const clients = [
    { href: '/basic-website', label: tw('footerLink') },
    { href: '/website-check', label: t('websiteCheck') },
    { href: '/login', label: t('login') },
  ];

  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.brand}>
          <Logo href="/" label={tc('homeLabel')} />
          <ul className={styles.social} aria-label={t('social')}>
            {SOCIAL_LINKS.map((link) => (
              <li key={link.name}>
                <a
                  className={styles.pill}
                  href={link.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {link.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav className={styles.column} aria-labelledby="footer-studio">
          <h2 id="footer-studio" className={styles.heading}>
            {t('explore')}
          </h2>
          <ul className={styles.links}>
            {studio.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className={styles.column} aria-labelledby="footer-clients">
          <h2 id="footer-clients" className={styles.heading}>
            {t('clients')}
          </h2>
          <ul className={styles.links}>
            {clients.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.column}>
          <h2 className={styles.heading}>{t('contactTitle')}</h2>
          <a href={`mailto:${CONTACT_EMAIL}`} className={styles.email}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      <div className={`wrap ${styles.bottom}`}>
        <p>{t('copyright', { year })}</p>
        <p className={styles.tagline}>{tc('tagline')}</p>
        <ul className={styles.legal}>
          {legalOwner ? (
            <>
              <li>
                <Link href="/legal" className={styles.link}>
                  {t('legal')}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={styles.link}>
                  {t('privacy')}
                </Link>
              </li>
            </>
          ) : null}
          <li>
            <Link href="/security" className={styles.link}>
              {t('security')}
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
