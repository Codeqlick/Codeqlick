'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { SITE_LOCALES, type AppLocale } from '@/i18n/routing';
import { LOCALE_NAMES } from '@/lib/locales';
import styles from './LocaleSwitcher.module.css';

/**
 * The language switcher, keeping the current path: an EN | ES toggle on the website and the other
 * apps, and on Cruising (decision 103) a menu of its six languages, each by its own name.
 */
export function LocaleSwitcher({
  className,
  locales = SITE_LOCALES,
}: {
  className?: string;
  locales?: readonly AppLocale[];
}) {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const pathname = usePathname();

  if (locales.length > SITE_LOCALES.length) {
    return (
      <details className={[styles.menu, className ?? ''].filter(Boolean).join(' ')}>
        <summary className={styles.summary} aria-label={t('label')}>
          <span lang={locale}>{locale}</span>
        </summary>
        <ul className={styles.list} aria-label={t('label')}>
          {locales.map((l) => (
            <li key={l}>
              <Link
                href={pathname}
                locale={l}
                hrefLang={l}
                lang={l}
                className={[styles.item, l === locale ? styles.current : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-current={l === locale ? 'true' : undefined}
              >
                {LOCALE_NAMES[l]}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    );
  }

  return (
    <nav
      aria-label={t('label')}
      className={[styles.switcher, className ?? ''].filter(Boolean).join(' ')}
    >
      {SITE_LOCALES.filter((l) => locales.includes(l)).map((l) => {
        const active = l === locale;
        return (
          <Link
            key={l}
            href={pathname}
            locale={l}
            hrefLang={l}
            lang={l}
            className={[styles.option, active ? styles.active : ''].filter(Boolean).join(' ')}
            aria-current={active ? 'true' : undefined}
            aria-label={t(l)}
          >
            {l}
          </Link>
        );
      })}
    </nav>
  );
}
