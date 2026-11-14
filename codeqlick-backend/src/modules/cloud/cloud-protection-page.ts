import type { PageLocale } from './cloud-protection.js';

/**
 * The page a protected address shows instead of its files (architecture 4.13 "Password
 * protection"): self-contained, with no external resources, so the strict CSP below holds.
 */

export type ProtectionPageError = 'wrong' | 'expired' | 'wait';

export interface ProtectionPageInput {
  locale: PageLocale;
  /** The project's name; null when the address isn't a known project's. */
  projectName: string | null;
  /** Where to go once the password is right (already a safe path). */
  next: string;
  error?: ProtectionPageError;
}

export const PROTECTION_PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

const COPY: Record<
  PageLocale,
  {
    title: string;
    heading: string;
    intro: string;
    label: string;
    button: string;
    errors: Record<ProtectionPageError, string>;
  }
> = {
  en: {
    title: 'Password required',
    heading: 'This site asks for a password',
    intro: 'Enter the password you were given to see it.',
    label: 'Password',
    button: 'Continue',
    errors: {
      wrong: 'Wrong password',
      expired: 'This link has expired. Enter the password, or ask your team for a new link.',
      wait: 'Too many tries. Wait a minute and try again.',
    },
  },
  es: {
    title: 'Contraseña necesaria',
    heading: 'Este sitio pide una contraseña',
    intro: 'Escribe la contraseña que te han dado para verlo.',
    label: 'Contraseña',
    button: 'Continuar',
    errors: {
      wrong: 'Contraseña incorrecta',
      expired: 'Este enlace ha caducado. Escribe la contraseña o pide a tu equipo un enlace nuevo.',
      wait: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
    },
  },
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** The "Click Q" mark (architecture 7): a ring whose tail is a cursor. */
const LOGO =
  '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="28" cy="28" r="18" fill="none" stroke="#D9177E" stroke-width="8"/><path d="M36 36 L60 45 L49 48 L46 59 Z" fill="#D9177E"/></svg>';

const STYLE = `:root{color-scheme:light dark;--ink:#14101f;--slate:#5c5768;--fuchsia:#d9177e;--fuchsia-dark:#a80f5e;--blush:#fceaf3;--bg:#fcfbfd;--card:#fff;--line:#eee8ef}
@media (prefers-color-scheme:dark){:root{--ink:#f4f1f7;--slate:#b9b3c4;--fuchsia:#ff7dbe;--fuchsia-dark:#ff7dbe;--blush:#2a1d2a;--bg:#14101f;--card:#1c1727;--line:#332b3d}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.6 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:26rem;padding:2rem 1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:2rem 1.5rem}
.brand{display:flex;align-items:center;gap:.5rem;margin:0 0 1.5rem;font:700 1.25rem/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:-.02em}
.mark{width:2rem;height:2rem}
.project{margin:0 0 .25rem;font:500 .8rem/1.4 "JetBrains Mono",ui-monospace,monospace;color:var(--slate);overflow-wrap:anywhere}
h1{margin:0 0 .5rem;font:700 1.4rem/1.2 "Space Grotesk",system-ui,sans-serif;letter-spacing:-.02em}
p{margin:0 0 1rem;color:var(--slate)}
label{display:block;margin:0 0 .35rem;font-weight:600;font-size:.9rem}
input{width:100%;padding:.7rem .85rem;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px}
input:focus{outline:2px solid var(--fuchsia);outline-offset:1px}
button{margin-top:1rem;width:100%;padding:.75rem 1rem;font:700 1rem/1.2 "Space Grotesk",system-ui,sans-serif;color:#fff;background:#d9177e;border:0;border-radius:999px;cursor:pointer}
button:hover{background:#a80f5e}
.error{margin:0 0 1rem;padding:.6rem .8rem;border-radius:10px;background:var(--blush);color:var(--fuchsia-dark);font-weight:600}`;

/** The whole page; every value from outside is escaped. */
export function renderProtectionPage(input: ProtectionPageInput): string {
  const copy = COPY[input.locale];
  const project = input.projectName
    ? `<p class="project">${escapeHtml(input.projectName)}</p>`
    : '';
  const error = input.error
    ? `<p class="error" role="alert">${escapeHtml(copy.errors[input.error])}</p>`
    : '';
  return `<!doctype html>
<html lang="${input.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(copy.title)} · Codeqlick Cloud</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="card">
<div class="brand">${LOGO}<span>codeqlick</span></div>
${project}<h1>${escapeHtml(copy.heading)}</h1>
<p>${escapeHtml(copy.intro)}</p>
${error}<form method="post" action="/__codeqlick/password">
<input type="hidden" name="next" value="${escapeHtml(input.next)}">
<label for="password">${escapeHtml(copy.label)}</label>
<input id="password" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128" autofocus>
<button type="submit">${escapeHtml(copy.button)}</button>
</form>
</div>
</main>
</body>
</html>
`;
}
