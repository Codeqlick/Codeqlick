import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { appFooter } from '@/lib/app-menus';
import { env, legalOwner } from '@/lib/env';
import type { Webapp } from '@/lib/webapps';
import styles from './AppFrame.module.css';

type AppFooterProps = {
  app: Webapp;
  locale: AppLocale;
  /** Cloud's docs (absolute when they live on their own site). */
  docsHref?: string;
};

/**
 * Every web app's footer (architecture 6.6): "© year Codeqlick" and the app's links (its rules
 * and legal pages, the website's contact), 14 px and slate above a hairline.
 */
export async function AppFooter({ app, locale, docsHref }: AppFooterProps) {
  const intl = await getTranslations({ locale });
  // Keys come from `appFooter` (checked against en.json by app-menus.test.ts).
  const t = (key: string, values?: Record<string, string | number>) =>
    intl(key as never, values as never);
  const links = appFooter(app, {
    locale,
    siteUrl: env.SITE_URL,
    legal: Boolean(legalOwner),
    docsHref,
  });
  // Server Component: rendered once per request, never re-rendered.
  // oxlint-disable-next-line react/purity
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.copyright}>{t('AppMenu.footer.copyright', { year })}</p>
        <nav aria-label={t('AppMenu.footer.label')}>
          <ul className={styles.links}>
            {links.map((item) => (
              <li key={item.id}>
                {item.external ? (
                  <a href={item.href} className={styles.link}>
                    {t(item.label)}
                  </a>
                ) : (
                  <Link href={item.href} className={styles.link}>
                    {t(item.label)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
