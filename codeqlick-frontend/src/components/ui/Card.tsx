import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './Card.module.css';

type CardProps = {
  as?: ElementType;
  children: ReactNode;
  bordered?: boolean;
  compact?: boolean;
  /** The whole card opens its `CardLink` (architecture 6.6): border, hover and focus ring. */
  interactive?: boolean;
  tone?: 'white' | 'blush';
  className?: string;
} & Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'>;

export function Card({
  as: Component = 'div',
  children,
  bordered = false,
  compact = false,
  interactive = false,
  tone = 'white',
  className,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    bordered ? styles.bordered : '',
    compact ? styles.compact : '',
    interactive ? styles.interactive : '',
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

/**
 * The one link of an interactive card, usually its title: it covers the whole card, so the card is
 * one target with one accessible name. Other links and buttons in the card stay clickable.
 */
export function CardLink({
  href,
  children,
  className,
  external = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  /** An address outside the app's locale routing (another host). */
  external?: boolean;
}) {
  const classes = [styles.cardLink, className ?? ''].filter(Boolean).join(' ');
  return external ? (
    <a href={href} className={classes}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
