'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { SITE_LOCALES } from '@/i18n/routing';
import styles from './LocaleSwitcher.module.css';

/**
 * The language switcher: an EN | ES toggle that keeps the current path. Inside an app's menu
 * drawer (`variant="inline"`, decision 107) the options are touch-sized.
 */
export function LocaleSwitcher({
  className,
  variant = 'menu',
}: {
  className?: string;
  variant?: 'menu' | 'inline';
}) {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('label')}
      className={[styles.switcher, variant === 'inline' ? styles.roomy : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {SITE_LOCALES.map((l) => {
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
            aria-label={`${l} – ${t(l)}`}
          >
            {l}
          </Link>
        );
      })}
    </nav>
  );
}
