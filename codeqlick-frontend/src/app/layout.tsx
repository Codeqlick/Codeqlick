import type { ReactNode } from 'react';

// Root passthrough: <html> and <body> are rendered by app/[locale]/layout.tsx so `lang` matches the locale.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
