type SymbolProps = {
  size?: number;
  /** Ring color. Defaults to brand fuchsia; the hero badge uses white. */
  ringColor?: string;
  cursorColor?: string;
  className?: string;
  /** Accessible name; when omitted the symbol is decorative (aria-hidden). */
  title?: string;
};

/** The Codeqlick "Click Q" mark: a ring plus a cursor (64×64 viewBox). */
export function BrandSymbol({
  size = 34,
  ringColor = '#D9177E',
  cursorColor = '#14101F',
  className,
  title,
}: SymbolProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <circle cx="28" cy="28" r="18" fill="none" stroke={ringColor} strokeWidth="8" />
      <path d="M36 36 L60 45 L49 48 L46 59 Z" fill={cursorColor} />
    </svg>
  );
}

// Exported as `Symbol` too (architecture 6.1 naming) without shadowing the global in this module.
export { BrandSymbol as Symbol };
