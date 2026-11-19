/**
 * Plain text only (architecture 4.20, Abuse): a menu has no reason to carry links, and links are
 * how spam and phishing pages start. Control characters and text that looks like a link are
 * refused; everything is escaped on output by the website.
 */

const CONTROL = /\p{Cc}/u;
// Line and paragraph separators, and the bidirectional overrides that can make text read
// differently from how it is stored (code point ranges). Emoji joiners stay allowed.
const FORBIDDEN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
// `http://`, `https://`, any `scheme://` and `www.`.
const LINKLIKE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i;

function hasForbiddenCharacter(text: string): boolean {
  if (CONTROL.test(text)) return true;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (FORBIDDEN_RANGES.some(([from, to]) => code >= from && code <= to)) return true;
  }
  return false;
}

const FORMAT = /\p{Cf}/gu;
// Full stops of other scripts that read as a dot: U+3002 and U+FF61.
const DOT_LOOKALIKES = [String.fromCodePoint(0x3002), String.fromCodePoint(0xff61)];

/**
 * The text as a reader sees it, for the link test only (the stored text is unchanged): every
 * invisible format character removed (zero width joiners too), compatibility forms folded (NFKC:
 * fullwidth letters and dots become ASCII) and the ideographic full stops turned into dots, so a
 * link disguised any of these ways is still found.
 */
export function visibleText(text: string): string {
  let visible = text.replace(FORMAT, '').normalize('NFKC');
  for (const dot of DOT_LOOKALIKES) visible = visible.split(dot).join('.');
  return visible;
}

/** What is wrong with the text, or null when it is fine. */
export function textProblem(text: string): string | null {
  if (hasForbiddenCharacter(text)) return 'Control characters are not allowed';
  if (LINKLIKE.test(visibleText(text))) return 'Links are not allowed in a menu';
  return null;
}
