import type { ReactNode } from 'react';

export type ServiceKey = 'web' | 'custom' | 'mobile' | 'design' | 'consulting' | 'support';

/** URL slug of each service page: /services/<slug>. English in both languages, like the routes. */
export const SERVICE_SLUGS: Record<ServiceKey, string> = {
  web: 'web-applications',
  custom: 'custom-software',
  mobile: 'mobile-and-pwa',
  design: 'ui-ux-design',
  consulting: 'technical-consulting',
  support: 'maintenance-and-support',
};

export function serviceBySlug(slug: string): ServiceKey | undefined {
  return (Object.keys(SERVICE_SLUGS) as ServiceKey[]).find((key) => SERVICE_SLUGS[key] === slug);
}

/** Services with their icon paths (24×24, stroked), in the order of the approved design. */
export const SERVICES: readonly { key: ServiceKey; icon: ReactNode }[] = [
  {
    key: 'web',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 14l-2 2 2 2M16 14l2 2-2 2" />
      </>
    ),
  },
  { key: 'custom', icon: <path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16" /> },
  {
    key: 'mobile',
    icon: (
      <>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
  },
  {
    key: 'design',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18" />
      </>
    ),
  },
  {
    key: 'consulting',
    icon: (
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
    ),
  },
  {
    key: 'support',
    icon: (
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
    ),
  },
];

/** The service's icon (24×24, stroked, decorative). */
export function ServiceIcon({ icon, className }: { icon: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon}
    </svg>
  );
}
