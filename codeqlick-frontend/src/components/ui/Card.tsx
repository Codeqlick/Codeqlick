import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import styles from './Card.module.css';

type CardProps = {
  as?: ElementType;
  children: ReactNode;
  bordered?: boolean;
  compact?: boolean;
  tone?: 'white' | 'blush';
  className?: string;
} & Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'>;

export function Card({
  as: Component = 'div',
  children,
  bordered = false,
  compact = false,
  tone = 'white',
  className,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    bordered ? styles.bordered : '',
    compact ? styles.compact : '',
    tone === 'blush' ? styles.blush : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
