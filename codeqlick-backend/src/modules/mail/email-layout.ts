import { siteLocale, type AccountLocale } from '../../common/schemas/common.schemas.js';

/** Whose email it is (architecture 4.18). */
export type MailBrand = 'codeqlick' | 'neoqlick';

/**
 * The parts of an email; `renderEmail` turns them into the plain-text body and the branded HTML
 * one. Every string is plain text: the HTML side escapes it.
 */
export interface EmailContent {
  /**
   * Neoqlick's emails have their own header, colours and footer and never say Codeqlick: every
   * "Codeqlick" of the text is written "Neoqlick" and the contact is hello@neoqlick.com.
   * Default: Codeqlick.
   */
  brand?: MailBrand;
  /** Only Cruising's emails use the languages beyond English and Spanish (decision 103). */
  locale: AccountLocale;
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
  /**
   * The website's unsubscribe page of an optional email (architecture 4.3, decision 70), linked in
   * the footer. Transactional emails never have one.
   */
  unsubscribeUrl?: string;
}

export interface EmailQuote {
  title?: string;
  body: string;
}

export interface RenderedEmail {
  text: string;
  html: string;
  /** Present on Neoqlick's emails only: `MailService` picks their sender and login from it. */
  brand?: 'neoqlick';
}

/** Brand tokens (architecture 7, 4.18), plus the shades an email needs for hierarchy. */
interface Theme {
  /** The brand's main colour (button, links, quote bar). */
  main: string;
  mainDark: string;
  mainLight: string;
  ink: string;
  body: string;
  slate: string;
  subtle: string;
  /** Soft background of quotes. */
  blush: string;
  line: string;
  surface: string;
  white: string;
  gradient: string;
  displayFont: string;
  fontsQuery: string;
  name: string;
  contact: string;
  logo: string;
  tagline: string | undefined;
}

const FONT_BODY = "'IBM Plex Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const CODEQLICK_THEME: Theme = {
  main: '#D9177E',
  mainDark: '#A80F5E',
  mainLight: '#FF7DBE',
  ink: '#14101F',
  body: '#3D3747',
  slate: '#5C5768',
  subtle: '#8A8494',
  blush: '#FCEAF3',
  line: '#EEE8EF',
  surface: '#F8F6F9',
  white: '#FFFFFF',
  gradient: 'linear-gradient(90deg, #FF7DBE 0%, #D9177E 45%, #A80F5E 100%)',
  displayFont: "'Space Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontsQuery: 'family=Space+Grotesk:wght@700',
  name: 'Codeqlick',
  contact: 'hello@codeqlick.com',
  logo: 'logo.png',
  tagline: 'Redefining information technology in society',
};

/** Violet and coral with Montserrat headings (architecture 4.18). */
const NEOQLICK_THEME: Theme = {
  main: '#7C3AED',
  mainDark: '#5B21B6',
  mainLight: '#A78BFA',
  ink: '#160F2B',
  body: '#3D3747',
  slate: '#5C5768',
  subtle: '#8A8494',
  blush: '#F3EEFE',
  line: '#E8E3F1',
  surface: '#F6F4FA',
  white: '#FFFFFF',
  gradient: 'linear-gradient(90deg, #A78BFA 0%, #7C3AED 55%, #FF5A7A 100%)',
  displayFont: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontsQuery: 'family=Montserrat:wght@600;700',
  name: 'Neoqlick',
  contact: 'hello@neoqlick.com',
  logo: 'neoqlick-logo.png',
  tagline: undefined,
};

const THEMES: Record<MailBrand, Theme> = { codeqlick: CODEQLICK_THEME, neoqlick: NEOQLICK_THEME };

/** "Codeqlick" and its spellings turned into Neoqlick's (architecture 4.18: no Codeqlick left). */
export function neoqlickText(text: string): string {
  return text
    .replaceAll('Codeqlick', 'Neoqlick')
    .replaceAll('codeqlick', 'neoqlick')
    .replaceAll('CODEQLICK', 'NEOQLICK');
}

/** A text in the brand's own words: Neoqlick's emails never name Codeqlick. */
export function brandText(text: string, brand: MailBrand | undefined): string {
  return brand === 'neoqlick' ? neoqlickText(text) : text;
}

const COPY: Record<
  AccountLocale,
  {
    signoff: string[];
    buttonFallback: string;
    replyable: string;
    unsubscribePrompt: string;
    unsubscribe: string;
  }
> = {
  en: {
    signoff: ['Best regards,', 'The Codeqlick team'],
    buttonFallback: "If the button doesn't work, paste this link into your browser:",
    replyable: 'Questions? Just reply to this email.',
    unsubscribePrompt: "Don't want these emails?",
    unsubscribe: 'Unsubscribe',
  },
  es: {
    signoff: ['Un saludo,', 'El equipo de Codeqlick'],
    buttonFallback: 'Si el botón no funciona, copia este enlace en tu navegador:',
    replyable: '¿Dudas? Responde a este correo y te contestamos.',
    unsubscribePrompt: '¿No quieres recibir estos correos?',
    unsubscribe: 'Darse de baja',
  },
  fr: {
    signoff: ['Bien cordialement,', 'L’équipe Codeqlick'],
    buttonFallback: 'Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :',
    replyable: 'Des questions ? Réponds simplement à cet e-mail.',
    unsubscribePrompt: 'Tu ne veux plus recevoir ces e-mails ?',
    unsubscribe: 'Se désabonner',
  },
  de: {
    signoff: ['Viele Grüße', 'Dein Codeqlick-Team'],
    buttonFallback: 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:',
    replyable: 'Fragen? Antworte einfach auf diese E-Mail.',
    unsubscribePrompt: 'Du möchtest diese E-Mails nicht mehr erhalten?',
    unsubscribe: 'Abmelden',
  },
  it: {
    signoff: ['Un saluto,', 'Il team di Codeqlick'],
    buttonFallback: 'Se il pulsante non funziona, copia questo link nel tuo browser:',
    replyable: 'Domande? Rispondi pure a questa email.',
    unsubscribePrompt: 'Non vuoi più ricevere queste email?',
    unsubscribe: 'Annulla l’iscrizione',
  },
  pt: {
    signoff: ['Com os melhores cumprimentos,', 'A equipa Codeqlick'],
    buttonFallback: 'Se o botão não funcionar, copia este link para o teu navegador:',
    replyable: 'Dúvidas? Basta responder a este email.',
    unsubscribePrompt: 'Não queres receber estes emails?',
    unsubscribe: 'Cancelar subscrição',
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/;

/** An escaped web address made a link; a long one may break anywhere (phones). */
function link(url: string, t: Theme): string {
  // A sentence's full stop or closing bracket after the address isn't part of it.
  const [, href = url, tail = ''] = /^(.*?)([.,;:!?)»]*)$/.exec(url) ?? [];
  const safe = escapeHtml(href);
  return `<a href="${safe}" target="_blank" style="color:${t.main};text-decoration:underline;word-break:break-all;">${safe}</a>${escapeHtml(tail)}`;
}

/** Escaped text with its line breaks kept and its web addresses linked. */
function multiline(value: string, t: Theme): string {
  return value
    .split(URL_PATTERN)
    .map((part, index) => (index % 2 === 1 ? link(part, t) : escapeHtml(part)))
    .join('')
    .replaceAll('\n', '<br>');
}

function quotes(content: EmailContent): EmailQuote[] {
  if (!content.quote) return [];
  return Array.isArray(content.quote) ? content.quote : [content.quote];
}

/** The content with Neoqlick's words (links and addresses stay as given). */
function inBrand(content: EmailContent): EmailContent {
  if (content.brand !== 'neoqlick') return content;
  const words = (text: string) => neoqlickText(text);
  const quote = quotes(content).map((item) => ({
    ...item,
    ...(item.title ? { title: words(item.title) } : {}),
    body: words(item.body),
  }));
  return {
    ...content,
    preheader: words(content.preheader),
    ...(content.title ? { title: words(content.title) } : {}),
    ...(content.greeting ? { greeting: words(content.greeting) } : {}),
    intro: content.intro.map(words),
    ...(content.quote ? { quote } : {}),
    ...(content.details
      ? {
          details: content.details.map(
            ([label, value]) => [words(label), value] as [string, string],
          ),
        }
      : {}),
    ...(content.button
      ? { button: { ...content.button, label: words(content.button.label) } }
      : {}),
    ...(content.outro ? { outro: content.outro.map(words) } : {}),
    ...(content.note ? { note: words(content.note) } : {}),
    ...(content.signoff ? { signoff: content.signoff.map(words) } : {}),
  };
}

function signoffOf(content: EmailContent): string[] {
  const own = content.signoff ?? COPY[content.locale].signoff;
  return content.signoff ? own : own.map((line) => brandText(line, content.brand));
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
  block(...signoffOf(content));
  if (content.unsubscribeUrl) {
    const copy = COPY[content.locale];
    block(`${copy.unsubscribePrompt} ${copy.unsubscribe}: ${content.unsubscribeUrl}`);
  }
  if (content.brand === 'neoqlick') block('Neoqlick', NEOQLICK_THEME.contact);
  return lines.join('\n');
}

/** One row of the card's inner table; every block of the body is one. */
function row(html: string, padding = '0 0 16px 0'): string {
  return `<tr><td style="padding:${padding};">${html}</td></tr>`;
}

function paragraph(text: string, t: Theme, style = ''): string {
  return `<p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:26px;color:${t.body};${style}">${multiline(text, t)}</p>`;
}

function renderHtml(content: EmailContent, siteUrl: string): string {
  const t = THEMES[content.brand ?? 'codeqlick'];
  const neo = content.brand === 'neoqlick';
  const copy = COPY[content.locale];
  const rows: string[] = [];

  if (content.title) {
    rows.push(
      row(
        `<h1 style="margin:0;font-family:${t.displayFont};font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.5px;color:${t.ink};">${escapeHtml(content.title)}</h1>`,
        '0 0 20px 0',
      ),
    );
  }
  if (content.greeting) {
    rows.push(row(paragraph(content.greeting, t, `color:${t.ink};font-weight:600;`)));
  }
  for (const text of content.intro) rows.push(row(paragraph(text, t)));

  for (const quote of quotes(content)) {
    const title = quote.title
      ? `<p style="margin:0 0 8px;font-family:${t.displayFont};font-size:17px;line-height:22px;font-weight:700;color:${t.ink};">${escapeHtml(quote.title)}</p>`
      : '';
    rows.push(
      row(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${t.blush}" style="background-color:${t.blush};border-left:4px solid ${t.main};border-radius:12px;padding:18px 20px;">${title}<p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${t.body};">${multiline(quote.body, t)}</p></td></tr></table>`,
        '4px 0 20px 0',
      ),
    );
  }

  if (content.details) {
    const cells = content.details
      .map(
        ([label, value]) =>
          `<tr><td style="padding:10px 16px 10px 0;border-bottom:1px solid ${t.line};font-family:${FONT_BODY};font-size:12px;line-height:20px;color:${t.subtle};text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid ${t.line};font-family:${FONT_BODY};font-size:15px;line-height:20px;color:${t.ink};word-break:break-word;">${multiline(value, t)}</td></tr>`,
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
        `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${t.main}" style="border-radius:999px;background-color:${t.main};"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${t.displayFont};font-size:16px;line-height:20px;font-weight:700;color:${t.white};text-decoration:none;border-radius:999px;">${escapeHtml(content.button.label)}</a></td></tr></table>`,
        '8px 0 20px 0',
      ),
      row(
        `<p style="margin:0;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${t.subtle};">${copy.buttonFallback}<br><a href="${url}" target="_blank" style="color:${t.main};text-decoration:underline;word-break:break-all;">${url}</a></p>`,
        '0 0 20px 0',
      ),
    );
  }

  for (const text of content.outro ?? []) rows.push(row(paragraph(text, t)));

  if (content.note) {
    rows.push(
      row(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${t.surface}" style="background-color:${t.surface};border-radius:12px;padding:16px 18px;font-family:${FONT_BODY};font-size:14px;line-height:22px;color:${t.slate};">${multiline(content.note, t)}</td></tr></table>`,
        '8px 0 20px 0',
      ),
    );
  }

  const signoff = signoffOf(content);
  if (signoff.length > 0) {
    rows.push(row(paragraph(signoff.join('\n'), t, `color:${t.slate};`), '4px 0 0 0'));
  }

  const site = escapeHtml(siteUrl);
  // The website speaks English and Spanish only: Cruising's other languages link its English.
  const home = `${site}/${siteLocale(content.locale)}`;
  const host = escapeHtml(siteUrl.replace(/^https?:\/\//, ''));
  const year = new Date().getFullYear();
  const unsubscribe = content.unsubscribeUrl
    ? `\n<p style="margin:6px 0 0;">${escapeHtml(copy.unsubscribePrompt)} <a href="${escapeHtml(content.unsubscribeUrl)}" target="_blank" style="color:${t.main};text-decoration:underline;">${escapeHtml(copy.unsubscribe)}</a></p>`
    : '';
  const headline = t.tagline
    ? `<p style="margin:0 0 6px;font-family:${t.displayFont};font-size:13px;font-weight:700;color:${t.ink};">${t.tagline}</p>\n`
    : '';
  const alt = neo ? 'neoqlick' : 'codeqlick';
  return `<!doctype html>
<html lang="${content.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&amp;${t.fontsQuery}&amp;display=swap" rel="stylesheet">
<title>${escapeHtml(content.title ?? t.name)}</title>
<style>
@media (max-width: 480px) {
  .cq-outer { padding: 24px 10px !important; }
  .cq-card { padding: 24px 20px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${t.surface};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${t.surface}" style="background-color:${t.surface};">
<tr><td align="center" class="cq-outer" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;">
<tr><td style="padding:0 4px 24px 4px;"><a href="${home}" target="_blank" style="text-decoration:none;"><img src="${site}/email/${t.logo}" width="152" height="38" alt="${alt}" style="display:block;border:0;"></a></td></tr>
<tr><td bgcolor="${t.white}" class="cq-card" style="background-color:${t.white};border:1px solid ${t.line};border-radius:20px;padding:32px 36px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:0 0 24px 0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="56" height="5" bgcolor="${t.main}" style="width:56px;height:5px;line-height:5px;font-size:0;border-radius:999px;background-color:${t.main};background-image:${t.gradient};">&nbsp;</td></tr></table></td></tr>
${rows.join('\n')}
</table>
</td></tr>
<tr><td align="center" style="padding:28px 16px 0 16px;font-family:${FONT_BODY};font-size:12px;line-height:19px;color:${t.subtle};">
${headline}<p style="margin:0 0 6px;">${neo ? neoqlickText(copy.replyable) : copy.replyable}</p>
<p style="margin:0;">© ${year} ${t.name} · <a href="${home}" target="_blank" style="color:${t.main};text-decoration:none;">${host}</a> · <a href="mailto:${t.contact}" style="color:${t.main};text-decoration:none;">${t.contact}</a></p>${unsubscribe}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Plain-text and branded HTML bodies of one email. `siteUrl` hosts the logo and the links: the
 * brand's own host (Neoqlick's emails get `NEOQLICK_URL`, never the website's).
 */
export function renderEmail(content: EmailContent, siteUrl: string): RenderedEmail {
  const branded = inBrand(content);
  const rendered = { text: renderText(branded), html: renderHtml(branded, siteUrl) };
  return content.brand === 'neoqlick' ? { ...rendered, brand: 'neoqlick' } : rendered;
}
