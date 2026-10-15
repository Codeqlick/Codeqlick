import type { ApiLocale } from '../../common/schemas/common.schemas.js';

/**
 * The parts of an email; `renderEmail` turns them into the plain-text body and the branded HTML
 * one. Every string is plain text: the HTML side escapes it.
 */
export interface EmailContent {
  locale: ApiLocale;
  /** Preview line shown by inboxes next to the subject; hidden in the body. */
  preheader: string;
  /** Headline at the top of the card. Left out for personal letters (replies to leads). */
  title?: string;
  /** "Hola Ada:" */
  greeting?: string;
  /** Paragraphs before the button. */
  intro: string[];
  /** A highlighted block (or several): the update or message the email is about. */
  quote?: EmailQuote | EmailQuote[];
  /** Label/value rows, e.g. the fields of a contact request. */
  details?: Array<[label: string, value: string]>;
  /** The main action. In the text version the bare URL is printed after `intro`. */
  button?: { label: string; url: string };
  /** Paragraphs after the button. */
  outro?: string[];
  /** Secondary information in a muted box: expiry, "ignore it if it wasn't you". */
  note?: string;
  /** Closing lines; defaults to the team's signature. */
  signoff?: string[];
}

export interface EmailQuote {
  title?: string;
  body: string;
}

export interface RenderedEmail {
  text: string;
  html: string;
}

/** Brand tokens (architecture 7), plus the shades an email needs for hierarchy. */
const BRAND = {
  fuchsia: '#D9177E',
  fuchsiaDark: '#A80F5E',
  fuchsiaLight: '#FF7DBE',
  ink: '#14101F',
  body: '#3D3747',
  slate: '#5C5768',
  subtle: '#8A8494',
  blush: '#FCEAF3',
  line: '#EEE8EF',
  surface: '#F8F6F9',
  white: '#FFFFFF',
};

const GRADIENT = `linear-gradient(90deg, ${BRAND.fuchsiaLight} 0%, ${BRAND.fuchsia} 45%, ${BRAND.fuchsiaDark} 100%)`;
const FONT_DISPLAY = "'Space Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_BODY = "'IBM Plex Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const COPY: Record<ApiLocale, { signoff: string[]; buttonFallback: string; replyable: string }> = {
  en: {
    signoff: ['Best regards,', 'The Codeqlick team'],
    buttonFallback: "If the button doesn't work, paste this link into your browser:",
    replyable: 'Questions? Just reply to this email.',
  },
  es: {
    signoff: ['Un saludo,', 'El equipo de Codeqlick'],
    buttonFallback: 'Si el botón no funciona, copia este enlace en tu navegador:',
    replyable: '¿Dudas? Responde a este correo y te contestamos.',
  },
};

const TAGLINE = 'Redefining information technology in society';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Escaped text with its line breaks kept. */
function multiline(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function quotes(content: EmailContent): EmailQuote[] {
  if (!content.quote) return [];
  return Array.isArray(content.quote) ? content.quote : [content.quote];
}

function renderText(content: EmailContent): string {
  const lines: string[] = [];
  const block = (...parts: string[]) => {
    if (parts.length === 0) return;
    if (lines.length > 0) lines.push('');
    lines.push(...parts);
  };
  if (content.title) block(content.title);
  if (content.greeting) block(content.greeting);
  for (const text of content.intro) block(text);
  for (const quote of quotes(content)) {
    if (quote.title) block(quote.title);
    block(quote.body);
  }
  if (content.details) block(...content.details.map(([label, value]) => `${label}: ${value}`));
  if (content.button) block(content.button.url);
  for (const text of content.outro ?? []) block(text);
  if (content.note) block(content.note);
  block(...(content.signoff ?? COPY[content.locale].signoff));
  return lines.join('\n');
}

/** One row of the card's inner table; every block of the body is one. */
function row(html: string, padding = '0 0 16px 0'): string {
  return `<tr><td style="padding:${padding};">${html}</td></tr>`;
}

function paragraph(text: string, style = ''): string {
  return `<p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:26px;color:${BRAND.body};${style}">${multiline(text)}</p>`;
}

function renderHtml(content: EmailContent, siteUrl: string): string {
  const copy = COPY[content.locale];
  const rows: string[] = [];

  if (content.title) {
    rows.push(
      row(
        `<h1 style="margin:0;font-family:${FONT_DISPLAY};font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.5px;color:${BRAND.ink};">${escapeHtml(content.title)}</h1>`,
        '0 0 20px 0',
      ),
    );
  }
  if (content.greeting) {
    rows.push(row(paragraph(content.greeting, `color:${BRAND.ink};font-weight:600;`)));
  }
  for (const text of content.intro) rows.push(row(paragraph(text)));

  for (const quote of quotes(content)) {
    const title = quote.title
      ? `<p style="margin:0 0 8px;font-family:${FONT_DISPLAY};font-size:17px;line-height:22px;font-weight:700;color:${BRAND.ink};">${escapeHtml(quote.title)}</p>`
      : '';
    rows.push(
      row(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${BRAND.blush}" style="background-color:${BRAND.blush};border-left:4px solid ${BRAND.fuchsia};border-radius:12px;padding:18px 20px;">${title}<p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${BRAND.body};">${multiline(quote.body)}</p></td></tr></table>`,
        '4px 0 20px 0',
      ),
    );
  }

  if (content.details) {
    const cells = content.details
      .map(
        ([label, value]) =>
          `<tr><td style="padding:10px 16px 10px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT_BODY};font-size:12px;line-height:20px;color:${BRAND.subtle};text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT_BODY};font-size:15px;line-height:20px;color:${BRAND.ink};word-break:break-word;">${multiline(value)}</td></tr>`,
      )
      .join('');
    rows.push(
      row(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">${cells}</table>`,
        '0 0 24px 0',
      ),
    );
  }

  if (content.button) {
    const url = escapeHtml(content.button.url);
    rows.push(
      row(
        `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${BRAND.fuchsia}" style="border-radius:999px;background-color:${BRAND.fuchsia};"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT_DISPLAY};font-size:16px;line-height:20px;font-weight:700;color:${BRAND.white};text-decoration:none;border-radius:999px;">${escapeHtml(content.button.label)}</a></td></tr></table>`,
        '8px 0 20px 0',
      ),
      row(
        `<p style="margin:0;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${BRAND.subtle};">${copy.buttonFallback}<br><a href="${url}" target="_blank" style="color:${BRAND.fuchsia};text-decoration:underline;word-break:break-all;">${url}</a></p>`,
        '0 0 20px 0',
      ),
    );
  }

  for (const text of content.outro ?? []) rows.push(row(paragraph(text)));

  if (content.note) {
    rows.push(
      row(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};border-radius:12px;padding:16px 18px;font-family:${FONT_BODY};font-size:14px;line-height:22px;color:${BRAND.slate};">${multiline(content.note)}</td></tr></table>`,
        '8px 0 20px 0',
      ),
    );
  }

  const signoff = content.signoff ?? copy.signoff;
  if (signoff.length > 0) {
    rows.push(row(paragraph(signoff.join('\n'), `color:${BRAND.slate};`), '4px 0 0 0'));
  }

  const site = escapeHtml(siteUrl);
  const home = `${site}/${content.locale}`;
  const host = escapeHtml(siteUrl.replace(/^https?:\/\//, ''));
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="${content.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&amp;family=Space+Grotesk:wght@700&amp;display=swap" rel="stylesheet">
<title>${escapeHtml(content.title ?? 'Codeqlick')}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.surface};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;">
<tr><td style="padding:0 4px 24px 4px;"><a href="${home}" target="_blank" style="text-decoration:none;"><img src="${site}/email/logo.png" width="152" height="38" alt="codeqlick" style="display:block;border:0;"></a></td></tr>
<tr><td bgcolor="${BRAND.white}" style="background-color:${BRAND.white};border:1px solid ${BRAND.line};border-radius:20px;padding:32px 36px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:0 0 24px 0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="56" height="5" bgcolor="${BRAND.fuchsia}" style="width:56px;height:5px;line-height:5px;font-size:0;border-radius:999px;background-color:${BRAND.fuchsia};background-image:${GRADIENT};">&nbsp;</td></tr></table></td></tr>
${rows.join('\n')}
</table>
</td></tr>
<tr><td align="center" style="padding:28px 16px 0 16px;font-family:${FONT_BODY};font-size:12px;line-height:19px;color:${BRAND.subtle};">
<p style="margin:0 0 6px;font-family:${FONT_DISPLAY};font-size:13px;font-weight:700;color:${BRAND.ink};">${TAGLINE}</p>
<p style="margin:0 0 6px;">${copy.replyable}</p>
<p style="margin:0;">© ${year} Codeqlick · <a href="${home}" target="_blank" style="color:${BRAND.fuchsia};text-decoration:none;">${host}</a> · <a href="mailto:hello@codeqlick.com" style="color:${BRAND.fuchsia};text-decoration:none;">hello@codeqlick.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text and branded HTML bodies of one email. `siteUrl` hosts the logo and the links. */
export function renderEmail(content: EmailContent, siteUrl: string): RenderedEmail {
  return { text: renderText(content), html: renderHtml(content, siteUrl) };
}
