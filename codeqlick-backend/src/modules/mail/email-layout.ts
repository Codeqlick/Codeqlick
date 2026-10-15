import type { ApiLocale } from '../../common/schemas/common.schemas.js';

/**
 * The parts of an email; `renderEmail` turns them into the plain-text body and the branded HTML
 * one. Every string is plain text: the HTML side escapes it.
 */
export interface EmailContent {
  locale: ApiLocale;
  /** Preview line shown by inboxes next to the subject; hidden in the body. */
  preheader: string;
  /** "Hola Ada:" */
  greeting?: string;
  /** Paragraphs before the button. */
  intro: string[];
  /** A highlighted block: the update or message the email is about. */
  quote?: { title?: string; body: string };
  /** Label/value rows, e.g. the fields of a contact request. */
  details?: Array<[label: string, value: string]>;
  /** The main action. In the text version the bare URL is printed after `intro`. */
  button?: { label: string; url: string };
  /** Paragraphs after the button. */
  outro?: string[];
  /** Closing lines; defaults to the team's signature. */
  signoff?: string[];
}

export interface RenderedEmail {
  text: string;
  html: string;
}

const BRAND = {
  fuchsia: '#D9177E',
  ink: '#14101F',
  slate: '#5C5768',
  blush: '#FCEAF3',
  line: '#EEE8EF',
  surface: '#F8F6F9',
};

const FONT_DISPLAY = "'Space Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_BODY = "'IBM Plex Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const SIGNOFF: Record<ApiLocale, string[]> = {
  en: ['Best regards,', 'The Codeqlick team'],
  es: ['Un saludo,', 'El equipo de Codeqlick'],
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

function renderText(content: EmailContent): string {
  const lines: string[] = [];
  const block = (...parts: string[]) => {
    if (parts.length === 0) return;
    if (lines.length > 0) lines.push('');
    lines.push(...parts);
  };
  if (content.greeting) block(content.greeting);
  for (const text of content.intro) block(text);
  if (content.quote) {
    if (content.quote.title) block(content.quote.title);
    block(content.quote.body);
  }
  if (content.details) block(...content.details.map(([label, value]) => `${label}: ${value}`));
  if (content.button) block(content.button.url);
  for (const text of content.outro ?? []) block(text);
  block(...(content.signoff ?? SIGNOFF[content.locale]));
  return lines.join('\n');
}

function paragraph(text: string, style = ''): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${BRAND.ink};${style}">${multiline(text)}</p>`;
}

function renderHtml(content: EmailContent, siteUrl: string): string {
  const parts: string[] = [];
  if (content.greeting) parts.push(paragraph(content.greeting, 'font-weight:600;'));
  parts.push(...content.intro.map((text) => paragraph(text)));

  if (content.quote) {
    const title = content.quote.title
      ? `<p style="margin:0 0 8px;font-family:${FONT_DISPLAY};font-size:18px;font-weight:700;line-height:1.3;color:${BRAND.ink};">${escapeHtml(content.quote.title)}</p>`
      : '';
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:${BRAND.blush};border-left:4px solid ${BRAND.fuchsia};border-radius:8px;padding:16px 20px;">${title}<p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${BRAND.ink};">${multiline(content.quote.body)}</p></td></tr></table>`,
    );
  }

  if (content.details) {
    const rows = content.details
      .map(
        ([label, value]) =>
          `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT_BODY};font-size:14px;color:${BRAND.slate};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT_BODY};font-size:14px;color:${BRAND.ink};word-break:break-word;">${multiline(value)}</td></tr>`,
      )
      .join('');
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">${rows}</table>`,
    );
  }

  if (content.button) {
    const url = escapeHtml(content.button.url);
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:${BRAND.fuchsia};"><a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FONT_DISPLAY};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(content.button.label)}</a></td></tr></table>`,
      `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:13px;line-height:1.5;color:${BRAND.slate};">${content.locale === 'es' ? 'Si el botón no funciona, copia este enlace en tu navegador:' : "If the button doesn't work, paste this link into your browser:"}<br><a href="${url}" style="color:${BRAND.fuchsia};word-break:break-all;">${url}</a></p>`,
    );
  }

  parts.push(...(content.outro ?? []).map((text) => paragraph(text)));
  const signoff = content.signoff ?? SIGNOFF[content.locale];
  if (signoff.length > 0) {
    parts.push(paragraph(signoff.join('\n'), `color:${BRAND.slate};margin:8px 0 0;`));
  }

  const site = escapeHtml(siteUrl);
  const host = escapeHtml(siteUrl.replace(/^https?:\/\//, ''));
  return `<!doctype html>
<html lang="${content.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&amp;family=Space+Grotesk:wght@700&amp;display=swap" rel="stylesheet">
<title>Codeqlick</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding:0 8px 20px;"><a href="${site}/${content.locale}" style="text-decoration:none;"><img src="${site}/email/logo.png" width="152" height="38" alt="codeqlick" style="display:block;border:0;"></a></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${BRAND.line};border-top:4px solid ${BRAND.fuchsia};border-radius:16px;padding:32px;">
${parts.join('\n')}
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${FONT_BODY};font-size:13px;line-height:1.6;color:${BRAND.slate};">
<p style="margin:0 0 4px;font-family:${FONT_DISPLAY};font-weight:700;color:${BRAND.ink};">${TAGLINE}</p>
<p style="margin:0;"><a href="${site}/${content.locale}" style="color:${BRAND.fuchsia};text-decoration:none;">${host}</a> · <a href="mailto:hello@codeqlick.com" style="color:${BRAND.fuchsia};text-decoration:none;">hello@codeqlick.com</a></p>
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
