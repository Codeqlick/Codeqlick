import type { ReactNode } from 'react';
import { isExternalHref } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { cloudDocsUrl } from '@/lib/cloud-docs-url';

/** A link to Cloud's documentation: the public site when CLOUD_DOCS_URL is set, else /cloud/docs. */
export function CloudDocsLink({
  locale,
  className,
  children,
}: {
  locale: string;
  className?: string;
  children: ReactNode;
}) {
  const href = cloudDocsUrl(locale);
  if (isExternalHref(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
