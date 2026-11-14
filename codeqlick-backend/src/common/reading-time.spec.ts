import { describe, expect, it } from 'vitest';
import { readingMinutes } from './reading-time.js';

const words = (count: number): string => Array.from({ length: count }, () => 'word').join(' ');

describe('readingMinutes', () => {
  it('is at least one minute, even for an empty text', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('Hola content')).toBe(1);
  });

  it('rounds up at 220 words a minute', () => {
    expect(readingMinutes(words(220))).toBe(1);
    expect(readingMinutes(words(221))).toBe(2);
    expect(readingMinutes(words(660))).toBe(3);
  });

  it('ignores fenced code blocks, also unclosed ones', () => {
    expect(readingMinutes(`${words(10)}\n\`\`\`ts\n${words(500)}\n\`\`\`\n${words(10)}`)).toBe(1);
    expect(readingMinutes(`~~~\n${words(500)}\n~~~`)).toBe(1);
    expect(readingMinutes(`${words(10)}\n\`\`\`\n${words(500)}`)).toBe(1);
  });

  it('counts inline code and link text but not link targets or image addresses', () => {
    const url = 'https://example.com/' + 'a'.repeat(50);
    expect(readingMinutes(`${words(219)} [one](${url})`)).toBe(1);
    expect(readingMinutes(`${words(219)} [one two](${url})`)).toBe(2);
    expect(readingMinutes(`${words(218)} ![alt text](${url})`)).toBe(1);
    expect(readingMinutes(`${words(218)} \`some code\``)).toBe(1);
    expect(readingMinutes(`${words(219)} \`some code\``)).toBe(2);
  });

  it('ignores HTML tags and tokens without letters or digits', () => {
    expect(readingMinutes(`<div class="x">${words(219)}</div>\n---\n* * *`)).toBe(1);
  });

  it('keeps prose between a lone < and a later >', () => {
    expect(readingMinutes(`\`a < b\` ${words(219)} \`() => x\``)).toBe(2);
  });

  it('does not close a fence on a line that carries an info string', () => {
    expect(
      readingMinutes(`\`\`\`\n${words(500)}\n\`\`\`ts\n${words(500)}\n\`\`\`\n${words(10)}`),
    ).toBe(1);
  });
});
