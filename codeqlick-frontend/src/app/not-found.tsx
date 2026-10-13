import '@/styles/globals.css';
import { routing } from '@/i18n/routing';
import { SITE_NAME } from '@/lib/site';

// Only reached for paths the proxy doesn't localize (e.g. unknown files); localized 404s live in
// app/[locale]/(site)/not-found.tsx. The root layout is a passthrough, so this renders <html> itself.
export default function GlobalNotFound() {
  return (
    <html lang={routing.defaultLocale}>
      <body>
        <main className="wrap" style={{ paddingTop: '5.5rem', paddingBottom: '5.5rem' }}>
          <p className="eyebrow">Error 404</p>
          <h1>Page not found</h1>
          <p className="lead">
            <a href={`/${routing.defaultLocale}`}>{SITE_NAME}</a>
          </p>
        </main>
      </body>
    </html>
  );
}
