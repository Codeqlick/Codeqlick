import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonClassName } from './buttonStyles';
import styles from './Pagination.module.css';

type PaginationProps = {
  page: number;
  totalPages: number;
  /** Locale-less pathname, e.g. `/blog` or `/admin/leads`. */
  pathname: string;
  /** Other query params to keep (filters). */
  query?: Record<string, string | undefined>;
};

function hrefFor(pathname: string, page: number, query: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Link-based pagination (works without JavaScript). Server Component. */
export async function Pagination({ page, totalPages, pathname, query }: PaginationProps) {
  if (totalPages <= 1) return null;
  const t = await getTranslations('Pagination');
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const linkClass = buttonClassName({ variant: 'outline', size: 'sm' });

  return (
    <nav className={styles.pagination} aria-label={t('label')}>
      <p className={styles.status}>{t('status', { page, totalPages })}</p>
      <div className={styles.links}>
        {prevDisabled ? (
          <span className={`${linkClass} ${styles.disabled}`} aria-disabled="true">
            {t('previous')}
          </span>
        ) : (
          <Link href={hrefFor(pathname, page - 1, query)} className={linkClass} rel="prev">
            {t('previous')}
          </Link>
        )}
        {nextDisabled ? (
          <span className={`${linkClass} ${styles.disabled}`} aria-disabled="true">
            {t('next')}
          </span>
        ) : (
          <Link href={hrefFor(pathname, page + 1, query)} className={linkClass} rel="next">
            {t('next')}
          </Link>
        )}
      </div>
    </nav>
  );
}
