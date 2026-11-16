import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { logoutAction } from '@/lib/auth/actions';
import type { AppMenuConfig, AppMenuItem } from '@/lib/app-menus';
import { env } from '@/lib/env';
import { webappUrl } from '@/lib/webapp-seo';
import { switcherApps, type Webapp } from '@/lib/webapps';
import { AppMenuDrawer, AppMenuLink } from './AppMenuDrawer';
import { LocaleSwitcher } from './LocaleSwitcher';
import styles from './AppMenu.module.css';

/** Each app's own message namespace (its brand and its "Sign out"). */
export const APP_MESSAGES: Record<Webapp, string> = {
  cruising: 'Cruising',
  swipe: 'Swipe',
  videochat: 'Videochat',
  citas: 'Citas',
  meetings: 'Meetings',
  cloud: 'Cloud',
};

type AppMenuProps = {
  app: Webapp;
  locale: AppLocale;
  config: AppMenuConfig;
  signedIn: boolean;
  /** The languages the switcher offers (Cruising's six, decision 103; else EN and ES). */
  locales?: readonly AppLocale[];
};

/**
 * The ☰ button and the drawer of a web app (decision 107): the app's sections from `config`, the
 * other Codeqlick apps, then the rules, the language and the account.
 */
export async function AppMenu({ app, locale, config, signedIn, locales }: AppMenuProps) {
  const intl = await getTranslations({ locale });
  // Keys come from each app's configuration (checked against en.json by app-menus.test.ts).
  const t = (key: string) => intl(key as never);
  const ns = APP_MESSAGES[app];
  const site = env.SITE_URL.replace(/\/$/, '');

  const link = (item: AppMenuItem, className: string) =>
    item.external ? (
      <a href={item.href} className={className}>
        {t(item.label)}
      </a>
    ) : (
      <AppMenuLink href={item.href} app={app} className={className}>
        {t(item.label)}
      </AppMenuLink>
    );

  return (
    <AppMenuDrawer
      openLabel={t('AppMenu.open')}
      closeLabel={t('AppMenu.close')}
      title={t('AppMenu.title')}
    >
      <nav className={styles.body} aria-label={t(`${ns}.brand`)}>
        {config.sections.map((section) => (
          <section
            key={section.id}
            className={styles.section}
            aria-labelledby={`app-menu-${section.id}`}
          >
            <h2 id={`app-menu-${section.id}`} className={styles.heading}>
              {t(section.heading)}
            </h2>
            <ul className={styles.list}>
              {section.items.map((item) => (
                <li key={item.id}>{link(item, styles.item)}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className={styles.section} aria-labelledby="app-menu-apps">
          <h2 id="app-menu-apps" className={styles.heading}>
            {t('AppSwitcher.label')}
          </h2>
          <ul className={styles.list}>
            {switcherApps(app).map(({ app: other, adult }) => (
              <li key={other}>
                <a
                  href={webappUrl(other, locale)}
                  className={styles.appItem}
                  data-umami-event="app-switcher"
                  data-umami-event-from={app}
                  data-umami-event-to={other}
                >
                  <span className={styles.appHead}>
                    <span className={styles.appName}>{t(`AppSwitcher.apps.${other}.name`)}</span>
                    {adult ? <span className={styles.adult}>+18</span> : null}
                  </span>
                  <span className={styles.appBody}>{t(`AppSwitcher.apps.${other}.body`)}</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href={`${site}/${locale}/apps`}
                className={styles.item}
                data-umami-event="app-switcher"
                data-umami-event-from={app}
                data-umami-event-to="all"
              >
                {t('AppSwitcher.all')}
              </a>
            </li>
          </ul>
        </section>
      </nav>
      <div className={styles.footer}>
        {config.footer.length > 0 ? (
          <ul className={styles.list}>
            {config.footer.map((item) => (
              <li key={item.id}>{link(item, styles.item)}</li>
            ))}
          </ul>
        ) : null}
        <LocaleSwitcher variant="inline" locales={locales} />
        {signedIn ? (
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <SubmitButton variant="outline" size="sm" block>
              {t(`${ns}.signOut`)}
            </SubmitButton>
          </form>
        ) : (
          <Link href={config.signInHref} className={styles.signIn}>
            {t('AppMenu.signIn')}
          </Link>
        )}
      </div>
    </AppMenuDrawer>
  );
}
