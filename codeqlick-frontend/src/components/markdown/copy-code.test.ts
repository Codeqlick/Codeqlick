import { describe, expect, it } from 'vitest';
import { codeText, copyText, type TextClipboard } from './copy-code';

type Pre = Parameters<typeof codeText>[0];

/** A `pre` as `codeText` sees it: its own text and, maybe, a `code` element inside. */
function fakePre(text: string, code?: string): Pre {
  return {
    textContent: text,
    querySelector: (selector: string) =>
      selector === 'code' && code !== undefined ? { textContent: code } : null,
  } as unknown as Pre;
}

describe('codeText', () => {
  it("copies the code element's text as written, without the trailing newline", () => {
    expect(codeText(fakePre('ignored', '  npm run build\n  npx deploy  \n'))).toBe(
      '  npm run build\n  npx deploy  ',
    );
  });

  it('drops only one trailing newline', () => {
    expect(codeText(fakePre('', 'a\n\n'))).toBe('a\n');
    expect(codeText(fakePre('', 'a\r\n'))).toBe('a');
  });

  it("falls back to the pre's text when there is no code element", () => {
    expect(codeText(fakePre('plain\n'))).toBe('plain');
  });
});

describe('copyText', () => {
  it('writes the text to the clipboard', async () => {
    const written: string[] = [];
    const clipboard: TextClipboard = {
      writeText: async (text) => {
        written.push(text);
      },
    };
    await expect(copyText('npx @codeqlick/cli login', clipboard)).resolves.toBe(true);
    expect(written).toEqual(['npx @codeqlick/cli login']);
  });

  it('reports a refused copy', async () => {
    const clipboard: TextClipboard = {
      writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    };
    await expect(copyText('x', clipboard)).resolves.toBe(false);
  });
});
