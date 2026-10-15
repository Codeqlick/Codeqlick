import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles';

export type { ButtonSize, ButtonVariant };

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof CommonProps> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<'a'>, keyof CommonProps | 'href'> & {
    href: string;
    /** Treat href as an external/absolute URL (mailto:, https:) and skip locale-aware routing. */
    external?: boolean;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/.test(href);
}

/**
 * Brand button. With `href` it renders a locale-aware `<Link>` (internal paths such as `/contact`)
 * or a plain `<a>` for external URLs; otherwise a `<button>` (type defaults to "button").
 */
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, block, className, children, href, external, ...rest } = props;
    const classes = buttonClassName({ variant, size, block, className });
    if (external || isExternalHref(href)) {
      return (
        <a href={href} className={classes} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  const { variant, size, block, className, children, type = 'button', ...rest } = props;
  return (
    <button type={type} className={buttonClassName({ variant, size, block, className })} {...rest}>
      {children}
    </button>
  );
}
