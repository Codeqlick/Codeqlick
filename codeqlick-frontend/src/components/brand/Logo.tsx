import { Link } from '@/i18n/navigation';
import { BRANDS } from '@/lib/brand';
import type { Brand } from '@/lib/hosts';
import { requestBrand } from '@/lib/request-brand';
import { BrandSymbol } from './Symbol';
import { NEOQLICK_WORDMARK_PATH } from './neoqlick-wordmark';
import styles from './Logo.module.css';

type LogoProps = {
  /** Locale-aware href (without locale prefix). Omit to render a non-link logo. */
  href?: string;
  size?: 'md' | 'sm';
  tone?: 'dark' | 'light';
  /** Accessible name for the link, e.g. "Codeqlick home". */
  label?: string;
  className?: string;
  /** The brand to draw; by default the one of the request's host. */
  brand?: Brand;
};

/**
 * Neoqlick's logo, concept D "Connection" (architecture 4.18): two overlapping circles and their
 * lens in a 64×64 viewBox, then the outlined wordmark; 221×64 in all. On dark backgrounds the
 * violet is lavender and the wordmark white.
 */
export function NeoqlickLogoSvg({
  height,
  tone = 'dark',
  title,
}: {
  height: number;
  tone?: 'dark' | 'light';
  title?: string;
}) {
  const onDark = tone === 'light';
  return (
    <svg
      width={Math.round((height * 221) / 64)}
      height={height}
      viewBox="0 0 221 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <circle cx="24" cy="32" r="18" fill={onDark ? '#A78BFA' : '#7C3AED'} />
      <circle cx="40" cy="32" r="18" fill="#FF5A7A" />
      <path
        d="M32 16.1 A18 18 0 0 1 32 47.9 A18 18 0 0 1 32 16.1 Z"
        fill="#2B0F4D"
        stroke="#2B0F4D"
        strokeWidth="0.6"
      />
      <path d={NEOQLICK_WORDMARK_PATH} fill={onDark ? '#FFFFFF' : '#160F2B'} />
    </svg>
  );
}

export async function Logo({
  href,
  size = 'md',
  tone = 'dark',
  label,
  className,
  brand,
}: LogoProps) {
  const which = brand ?? (await requestBrand());
  const classes = [
    styles.logo,
    size === 'sm' ? styles.sm : '',
    tone === 'light' ? styles.light : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const content =
    which === 'neoqlick' ? (
      <NeoqlickLogoSvg height={size === 'sm' ? 28 : 38} tone={tone} />
    ) : (
      <>
        <BrandSymbol
          size={size === 'sm' ? 24 : 34}
          cursorColor={tone === 'light' ? '#FFFFFF' : '#14101F'}
        />
        <span className={styles.wordmark}>{BRANDS.codeqlick.wordmark}</span>
      </>
    );

  if (!href) {
    return (
      <span
        className={classes}
        role={which === 'neoqlick' ? 'img' : undefined}
        aria-label={which === 'neoqlick' ? BRANDS.neoqlick.name : undefined}
      >
        {content}
      </span>
    );
  }

  return (
    <Link href={href} className={classes} aria-label={label}>
      {content}
    </Link>
  );
}
