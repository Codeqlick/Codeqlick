const WORDS_PER_MINUTE = 220;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** A closing fence carries nothing but spaces after its marker. */
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/;

/** Drops fenced code blocks (an unclosed fence runs to the end, as in Markdown). */
function withoutFencedCode(markdown: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (fence === null) {
      const marker = FENCE.exec(line)?.[1];
      if (marker) fence = marker;
      else kept.push(line);
      continue;
    }
    const closing = CLOSING_FENCE.exec(line)?.[1];
    if (closing && closing[0] === fence[0] && closing.length >= fence.length) {
      fence = null;
    }
  }
  return kept.join('\n');
}

/**
 * Minutes to read a Markdown text at 220 words a minute, rounded up, at least 1. Fenced code
 * blocks, link targets, image addresses and HTML tags are not counted; link text and image alt
 * text are. A word is a whitespace-separated token with at least one letter or digit.
 */
export function readingMinutes(markdown: string): number {
  const text = withoutFencedCode(markdown)
    .replace(/\]\([^)]*\)/g, ' ')
    .replace(/<\/?[A-Za-z][^<>]*>/g, ' ');
  const words = text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
