import { getLocale } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { NotFoundContent } from './NotFoundContent';

// Reached when a site page calls notFound() (an unknown post or case study). Next.js 16.4 sends
// that response as an empty document and draws this boundary in the browser; unknown URLs get the
// server-rendered app/not-found.tsx instead.
export default async function NotFound() {
  return <NotFoundContent locale={localeOrDefault(await getLocale())} />;
}
