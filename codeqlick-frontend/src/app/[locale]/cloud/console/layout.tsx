import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** The console is the account's own: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return children;
}
