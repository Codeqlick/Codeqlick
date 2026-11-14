/**
 * The links of a post's or case study's Markdown (architecture 4.6, Broken links), read the way the
 * website renders it: react-markdown with CommonMark only (no GFM, so a bare URL is no link) and no
 * raw HTML. A dependency-free reader of the constructs that make links: inline links and images
 * `[text](url)` / `![alt](url)`, autolinks `<https://…>` and reference definitions `[x]: url`.
 * Fenced and indented code blocks and inline code are skipped.
 */

/** Longest link kept (in the database, and in its unique index). */
export const MAX_LINK_LENGTH = 2048;

const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const DEFINITION = /^ {0,3}\[(?:[^\]\\]|\\.)+\]:[ \t]*(?:<([^<>\n]*)>|(\S+))/;
const AUTOLINK = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/g;
const ESCAPABLE = /\\([!-/:-@[-`{-~])/g;

/** Every link and image destination of `markdown` as written, in order, without repeats. */
export function extractMarkdownLinks(markdown: string): string[] {
  const { paragraphs, definitions } = readBlocks(markdown);
  const found: string[] = [];
  for (const paragraph of paragraphs) {
    const text = blankCodeSpans(paragraph);
    found.push(...inlineDestinations(text));
    for (const match of text.matchAll(AUTOLINK)) found.push(match[1]!);
  }
  found.push(...definitions);
  return [...new Set(found.map((href) => href.trim()).filter((href) => href.length > 0))];
}

/** Columns of leading whitespace (a tab counts as 4, enough for telling code apart). */
function indentWidth(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4;
    else break;
  }
  return width;
}

/**
 * The text outside code blocks, split into paragraphs (inline constructs never cross a blank
 * line), and the destinations of the reference definitions.
 */
function readBlocks(markdown: string): { paragraphs: string[]; definitions: string[] } {
  const paragraphs: string[] = [];
  const definitions: string[] = [];
  let current: string[] = [];
  const endParagraph = () => {
    if (current.length > 0) paragraphs.push(current.join('\n'));
    current = [];
  };

  let fence: { char: string; length: number } | null = null;
  let previousBlank = true;
  let inList = false;
  let inIndentedCode = false;

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    // Block quotes hold the same constructs: read what is inside them.
    const line = raw.replace(/^(?: {0,3}> ?)+/, '');

    if (fence) {
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1]![0] === fence.char && close[1]!.length >= fence.length) fence = null;
      continue;
    }

    // Inside a list item, a fence is indented like the item's text.
    const open = (inList ? /^[ \t]*(`{3,}|~{3,})(.*)$/ : /^ {0,3}(`{3,}|~{3,})(.*)$/).exec(line);
    if (open && !(open[1]![0] === '`' && open[2]!.includes('`'))) {
      endParagraph();
      fence = { char: open[1]![0]!, length: open[1]!.length };
      previousBlank = false;
      inIndentedCode = false;
      continue;
    }

    if (line.trim() === '') {
      endParagraph();
      previousBlank = true;
      continue;
    }

    const indent = indentWidth(line);
    // Indented code starts after a blank line (an indented line right after text continues the
    // paragraph) and outside lists, where indentation is the item's own text.
    if (indent >= 4 && (inIndentedCode || (previousBlank && !inList))) {
      endParagraph();
      inIndentedCode = true;
      previousBlank = false;
      continue;
    }
    inIndentedCode = false;

    if (LIST_ITEM.test(line)) inList = true;
    else if (previousBlank && indent < 2) inList = false;

    const definition = DEFINITION.exec(line);
    if (definition) {
      endParagraph();
      definitions.push(unescape(definition[1] ?? definition[2]!));
      previousBlank = false;
      continue;
    }

    current.push(line);
    previousBlank = false;
  }
  endParagraph();
  return { paragraphs, definitions };
}

/** `text` with every inline code span replaced by spaces (same length). */
function blankCodeSpans(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char === '\\' && i + 1 < text.length) {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (char !== '`') {
      out += char;
      i += 1;
      continue;
    }
    let run = 1;
    while (text[i + run] === '`') run += 1;
    // The span closes at the next run of exactly as many backticks.
    let close = -1;
    let j = i + run;
    while (j < text.length) {
      if (text[j] !== '`') {
        j += 1;
        continue;
      }
      let length = 1;
      while (text[j + length] === '`') length += 1;
      if (length === run) {
        close = j;
        break;
      }
      j += length;
    }
    if (close === -1) {
      // No closing run: the backticks are plain text.
      out += text.slice(i, i + run);
      i += run;
      continue;
    }
    out += ' '.repeat(close + run - i);
    i = close + run;
  }
  return out;
}

/** Destinations of `[text](url)` and `![alt](url)`, nested images included. */
function inlineDestinations(text: string): string[] {
  const found: string[] = [];
  // The `[` and `![` waiting for their `]`, innermost last.
  const openers: { image: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '[') {
      // `\![` is a literal `!` before a plain bracket (the escape was skipped above).
      openers.push({ image: i > 0 && text[i - 1] === '!' && text[i - 2] !== '\\' });
      continue;
    }
    if (char !== ']' || openers.length === 0) continue;
    const opener = openers.pop()!;
    if (text[i + 1] !== '(') continue;
    const destination = readDestination(text, i + 2);
    if (!destination) continue;
    if (destination.href) found.push(destination.href);
    // CommonMark: a link can't contain another link, so the `[` opened before it are plain text
    // now; an image's `![` stays open (`![a [b](x)](y)` is an image of y).
    if (!opener.image) {
      const images = openers.filter((open) => open.image);
      openers.length = 0;
      openers.push(...images);
    }
    i = destination.end - 1;
  }
  return found;
}

/**
 * Reads `url "title")` from `start` (just after the opening parenthesis). Returns the destination
 * (empty for `()`) and the index after the closing parenthesis, or null when it isn't a link.
 */
function readDestination(text: string, start: number): { href: string; end: number } | null {
  let i = skipSpace(text, start);
  let href: string;
  if (text[i] === '<') {
    let j = i + 1;
    while (j < text.length && text[j] !== '>' && text[j] !== '<' && text[j] !== '\n') {
      j += text[j] === '\\' ? 2 : 1;
    }
    if (text[j] !== '>') return null;
    href = text.slice(i + 1, j);
    i = j + 1;
  } else {
    const begin = i;
    let depth = 0;
    while (i < text.length) {
      const char = text[i]!;
      if (char === '\\' && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (char === '(') depth += 1;
      else if (char === ')') {
        if (depth === 0) break;
        depth -= 1;
      } else if (/\s/.test(char) || char < ' ') break;
      i += 1;
    }
    if (depth !== 0) return null;
    href = text.slice(begin, i);
  }

  i = skipSpace(text, i);
  const quote = text[i];
  if (quote === '"' || quote === "'" || quote === '(') {
    const closing = quote === '(' ? ')' : quote;
    let j = i + 1;
    while (j < text.length && text[j] !== closing) j += text[j] === '\\' ? 2 : 1;
    if (j >= text.length) return null;
    i = skipSpace(text, j + 1);
  }
  if (text[i] !== ')') return null;
  return { href: unescape(href), end: i + 1 };
}

/** Skips spaces and tabs and at most one line break. */
function skipSpace(text: string, from: number): number {
  let i = from;
  let breaks = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === ' ' || char === '\t') i += 1;
    else if (char === '\n' && breaks === 0) {
      breaks += 1;
      i += 1;
    } else break;
  }
  return i;
}

/** Backslash escapes and the character references people paste into links. */
function unescape(href: string): string {
  return href
    .replace(ESCAPABLE, '$1')
    .replace(/&#(\d{1,7});/g, (_, code: string) => safeCodePoint(Number(code)))
    .replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (_, code: string) =>
      safeCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, '&');
}

function safeCodePoint(code: number): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
}

export interface ResolvedLink {
  /** Absolute; a relative link is resolved against the page it appears on. */
  url: string;
  /** On the website itself (SITE_URL's host, with or without `www.`). */
  internal: boolean;
}

/**
 * The absolute address of a link found on the page at `pageUrl`, or null for what isn't checked:
 * anchors on the same page (`#…`), `mailto:` and any other non-http(s) scheme, invalid addresses
 * and addresses longer than `MAX_LINK_LENGTH`.
 */
export function resolveLink(href: string, pageUrl: string, siteUrl: string): ResolvedLink | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  let url: URL;
  try {
    url = new URL(trimmed, pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.href.length > MAX_LINK_LENGTH) return null;
  return { url: url.href, internal: isOnSite(url, siteUrl) };
}

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function isOnSite(url: URL, siteUrl: string): boolean {
  return hostKey(url.hostname) === hostKey(new URL(siteUrl).hostname);
}

/** The address without its fragment: what is actually requested. */
export function withoutFragment(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href;
}
