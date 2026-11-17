import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import footer from '@/components/layout/AppFrame.module.css';
import { Link } from '@/i18n/navigation';
import { CRUISING_LOCALES, type AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL_NEOQLICK } from '@/lib/brand';
import { neoqlickLegalOwner } from '@/lib/env';
import { NEOQLICK_TAGLINE } from '@/lib/neoqlick-tagline';
import { neoqlickAccountUrl } from '@/lib/portal-links';
import styles from './neoqlick.module.css';

/**
 * The frame of Neoqlick's portal and of the 404 on its hosts (architecture 4.18): the logo and
 * language switcher in the header, the legal links and the contact address in the footer. It has
 * no session: the portal never knows who is looking.
 */
export async function PortalFrame({
  locale,
  children,
  account = true,
}: {
  locale: AppLocale;
  children: ReactNode;
  /** The header's "My account" link (not on the account host itself, which is where it goes). */
  account?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'Neoqlick' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  // Server Component: rendered once per request, never re-rendered.
  // oxlint-disable-next-line react/purity
  const year = new Date().getFullYear();
  const links = [
    ...(neoqlickLegalOwner
      ? [
          { href: '/legal', label: t('legal') },
          { href: '/privacy', label: t('privacy') },
          { href: '/terms', label: t('terms') },
        ]
      : []),
    { href: '/safety-contact', label: t('safetyContact') },
  ];

  return (
    <div className={styles.frame}>
      <a className="skip-link" href="#main">
        {tc('skipToContent')}
      </a>
      <header className={styles.header}>
        <Logo href="/" size="sm" label={tc('homeLabel')} />
        <div className={styles.headerActions}>
          {account ? (
            <a href={neoqlickAccountUrl(locale)} className={styles.account}>
              {t('accountCta')}
            </a>
          ) : null}
          <LocaleSwitcher locales={CRUISING_LOCALES} />
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <footer className={footer.footer}>
        <div className={footer.footerInner}>
          <div>
            <p className={footer.copyright}>{t('copyright', { year })}</p>
            <p className={footer.copyright} lang="en">
              {NEOQLICK_TAGLINE}
            </p>
          </div>
          <nav aria-label={t('legalLabel')}>
            <ul className={footer.links}>
              {links.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={footer.link}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href={`mailto:${CONTACT_EMAIL_NEOQLICK}`} className={footer.link}>
                  {CONTACT_EMAIL_NEOQLICK}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
