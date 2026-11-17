import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'outline' | 'ink' | 'ghost' | 'danger' | 'link';
/** sm 36 px (44 to the touch), md 44 px (the default), lg 52 px (home hero and final band only). */
export type ButtonSize = 'sm' | 'md' | 'lg';

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}): string {
  return [
    styles.button,
    styles[variant],
    size === 'md' ? '' : styles[size],
    block ? styles.block : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}
