import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/Avatar';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { AuthUser } from '@/lib/api/types';
import { logoutAction } from '@/lib/auth/actions';
import {
  accountSettingsHref,
  accountSiteOrigin,
  type AppMenuConfig,
  type AppMenuItem,
} from '@/lib/app-menus';
import { env } from '@/lib/env';
import type { Brand } from '@/lib/hosts';
import { requestBrand } from '@/lib/request-brand';
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
  /** The signed-in person, or null. */
  user: AuthUser | null;
  /** The app's "verified" badge on the card (Cruising, Swipe, Videochat). */
  verified?: boolean;
  /** The languages the switcher offers (Cruising's six, decision 103; else EN and ES). */
  locales?: readonly AppLocale[];
};

/**
 * "My account": one helper for every app. It points at the account site (account.codeqlick.com,
 * decision 108) as soon as that is switched on with `ACCOUNT_SSO=true`, else at the portal's.
 */
function myAccountHref(locale: AppLocale, user: AuthUser, brand: Brand): string {
  const base = brand === 'neoqlick' ? (env.NEOQLICK_URL ?? env.SITE_URL) : env.SITE_URL;
  const origin = accountSiteOrigin(base, env.ACCOUNT_SSO);
  return accountSettingsHref(locale, user.role, base, origin);
}

/**
 * The ☰ button and the drawer of a web app (decision 107): the user card (who is signed in, the
 * app's profile and the account, or signing in and up), the app's sections from `config`, the
 * other Codeqlick apps, then the rules, the language and signing out.
 */
export async function AppMenu({ app, locale, config, user, verified, locales }: AppMenuProps) {
  const intl = await getTranslations({ locale });
  // Keys come from each app's configuration (checked against en.json by app-menus.test.ts).
  const t = (key: string) => intl(key as never);
  const ns = APP_MESSAGES[app];
  const brand = await requestBrand();
  const neoqlick = brand === 'neoqlick';
  // "All apps" is the website's list; Neoqlick's is its portal's home (no cross-links, 4.18).
  const site = (neoqlick ? (env.NEOQLICK_URL ?? env.SITE_URL) : env.SITE_URL).replace(/\/$/, '');

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

  const card = (
    <section className={styles.card} aria-label={t('AppMenu.card.label')}>
      {user ? (
        <>
          <div className={styles.cardWho}>
            <Avatar file={user.avatar} name={user.name} size="md" />
            <div className={styles.cardText}>
              <p className={styles.cardName}>
                <span>{user.name}</span>
                {verified ? (
                  <span className={styles.verified}>
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M8 0l2.1 1.5 2.6-.1.9 2.4 2.1 1.6-.8 2.5.8 2.5-2.1 1.6-.9 2.4-2.6-.1L8 16l-2.1-1.5-2.6.1-.9-2.4L.3 10.6l.8-2.6-.8-2.5 2.1-1.6.9-2.4 2.6.1L8 0zm-1 10.6l4.6-4.6-1-1L7 8.6 5.4 7l-1 1L7 10.6z" />
                    </svg>
                    {t('AppMenu.card.verified')}
                  </span>
                ) : null}
              </p>
              {user.username ? <p className={styles.cardUsername}>@{user.username}</p> : null}
            </div>
          </div>
          <div className={styles.cardButtons}>
            {config.profile ? (
              <AppMenuLink href={config.profile.href} app={app} className={styles.cardPrimary}>
                {t(config.profile.label)}
              </AppMenuLink>
            ) : null}
            <a href={myAccountHref(locale, user, brand)} className={styles.cardSecondary}>
              {t('AppMenu.card.account')}
            </a>
          </div>
        </>
      ) : (
        <div className={styles.cardButtons}>
          <Link href={config.signInHref} className={styles.cardPrimary}>
            {t('AppMenu.signIn')}
          </Link>
          <Link href={config.registerHref} className={styles.cardSecondary}>
            {t('AppMenu.card.register')}
          </Link>
        </div>
      )}
    </section>
  );

  return (
    <AppMenuDrawer
      openLabel={user ? intl('AppMenu.openFor', { name: user.name }) : t('AppMenu.open')}
      closeLabel={t('AppMenu.close')}
      title={t('AppMenu.title')}
      avatar={user ? <Avatar file={user.avatar} name={user.name} size="sm" /> : null}
    >
      {card}
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
            {switcherApps(app, brand).map(({ app: other }) => (
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
                  </span>
                  <span className={styles.appBody}>{t(`AppSwitcher.apps.${other}.body`)}</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href={neoqlick ? `${site}/${locale}` : `${site}/${locale}/apps`}
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
        {/* Signed out, signing in and up is on the card at the top. */}
        {user ? (
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <SubmitButton variant="outline" size="sm" block>
              {t(`${ns}.signOut`)}
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </AppMenuDrawer>
  );
}
