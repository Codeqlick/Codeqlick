'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import styles from './LocaleSwitcher.module.css';

/** EN | ES toggle that keeps the current path. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className={[styles.switcher, className ?? ''].filter(Boolean).join(' ')}>
      {routing.locales.map((l) => {
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
