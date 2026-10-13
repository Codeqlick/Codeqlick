import { Link } from '@/i18n/navigation';
import { BrandSymbol } from './Symbol';
import styles from './Logo.module.css';

type LogoProps = {
  /** Locale-aware href (without locale prefix). Omit to render a non-link logo. */
  href?: string;
  size?: 'md' | 'sm';
  tone?: 'dark' | 'light';
  /** Accessible name for the link, e.g. "Codeqlick home". */
  label?: string;
  className?: string;
};

export function Logo({ href, size = 'md', tone = 'dark', label, className }: LogoProps) {
  const classes = [
    styles.logo,
    size === 'sm' ? styles.sm : '',
    tone === 'light' ? styles.light : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <BrandSymbol
        size={size === 'sm' ? 24 : 34}
        cursorColor={tone === 'light' ? '#FFFFFF' : '#14101F'}
      />
      <span className={styles.wordmark}>codeqlick</span>
    </>
  );

  if (!href) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <Link href={href} className={classes} aria-label={label}>
      {content}
    </Link>
  );
}
