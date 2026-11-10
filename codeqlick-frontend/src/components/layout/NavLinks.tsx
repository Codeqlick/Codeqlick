'use client';

import { Link, usePathname } from '@/i18n/navigation';

/** True when `pathname` is `href` or one of its subpages (e.g. a post under /blog). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The header's text links, marking the section the visitor is in with aria-current. */
export function NavLinks({
  items,
  className,
}: {
  items: { href: string; label: string }[];
  className?: string;
}) {
  const pathname = usePathname();
  return items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={className}
      aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
    >
      {item.label}
    </Link>
  ));
}
