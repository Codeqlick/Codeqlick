import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BASE_CLIENT_NAMESPACES } from './client-namespaces';
import type { AppLocale } from './routing';

export { APP_NAMESPACES } from './client-namespaces';

/** Hands Client Components below it the base namespaces plus `extra`. */
export async function ClientMessages({
  extra = [],
  locale,
  children,
}: {
  extra?: readonly string[];
  /** Only where the request's locale isn't set (the root not-found page). */
  locale?: AppLocale;
  children: ReactNode;
}) {
  const all = await getMessages(locale ? { locale } : undefined);
  const messages = Object.fromEntries(
    [...BASE_CLIENT_NAMESPACES, ...extra]
      .filter((namespace) => namespace in all)
      .map((namespace) => [namespace, all[namespace as keyof typeof all]]),
  );
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
