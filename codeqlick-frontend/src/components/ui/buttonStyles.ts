import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'outline' | 'ink' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

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
    size === 'sm' ? styles.sm : '',
    block ? styles.block : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}
