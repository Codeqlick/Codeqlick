import { describe, expect, it } from 'vitest';
import {
  extractMarkdownLinks,
  MAX_LINK_LENGTH,
  resolveLink,
  withoutFragment,
} from './markdown-links.js';

describe('extractMarkdownLinks', () => {
  it('finds inline links and images, with or without a title', () => {
    const markdown = [
      'Read [the guide](https://example.com/guide "The guide") and',
      "see ![a chart](/media/chart.png 'Chart') or [ours](</blog/my post>).",
    ].join('\n');
    expect(extractMarkdownLinks(markdown)).toEqual([
      'https://example.com/guide',
      '/media/chart.png',
      '/blog/my post',
    ]);
  });

  it('finds an image inside a link, and destinations with balanced parentheses', () => {
    const markdown =
      '[![Logo](https://cdn.example.com/logo.png)](https://example.com) and ' +
      '[wiki](https://en.wikipedia.org/wiki/Rust_(programming_language)).';
    expect(extractMarkdownLinks(markdown)).toEqual([
      'https://cdn.example.com/logo.png',
      'https://example.com',
      'https://en.wikipedia.org/wiki/Rust_(programming_language)',
    ]);
  });

  it('keeps an image open around a link in its alt text, but not a link around a link', () => {
    expect(extractMarkdownLinks('![a [b](https://x.example)](https://y.example/pic.png)')).toEqual([
      'https://x.example',
      'https://y.example/pic.png',
    ]);
    // A link inside a link's text: the inner one only (the outer brackets are plain text).
    expect(extractMarkdownLinks('[a [b](https://inner.example) c](https://outer.example)')).toEqual(
      ['https://inner.example'],
    );
    // An escaped `!` makes a plain bracket.
    expect(extractMarkdownLinks('\\![a [b](https://in.example)](https://out.example)')).toEqual([
      'https://in.example',
    ]);
  });

  it('finds autolinks and reference definitions', () => {
    const markdown = [
      'Write to <hello@codeqlick.com> or visit <https://codeqlick.com/contact>.',
      '',
      'See [the docs][docs] too.',
      '',
      '[docs]: https://docs.example.com/start "Docs"',
      '[other]: <https://example.com/a b>',
    ].join('\n');
    expect(extractMarkdownLinks(markdown)).toEqual([
      'https://codeqlick.com/contact',
      'https://docs.example.com/start',
      'https://example.com/a b',
    ]);
  });

  it('ignores bare URLs (the website renders CommonMark without autolinked text)', () => {
    expect(extractMarkdownLinks('Go to https://example.com now.')).toEqual([]);
  });

  it('skips fenced code blocks, with backticks or tildes, closed by a long enough fence', () => {
    const markdown = [
      'Before [a](https://a.example).',
      '````md',
      '```',
      '[not a link](https://code.example)',
      '```',
      '````',
      '~~~',
      '<https://tilde.example>',
      '~~~',
      'After [b](https://b.example).',
    ].join('\n');
    expect(extractMarkdownLinks(markdown)).toEqual(['https://a.example', 'https://b.example']);
  });

  it('skips indented code, but not indented text in a list or a paragraph', () => {
    const markdown = [
      'Some text.',
      '',
      '    [code](https://indented.example)',
      '',
      '- An item',
      '',
      '    [continued](https://item.example)',
      '',
      'A paragraph',
      '    [lazy](https://lazy.example)',
    ].join('\n');
    expect(extractMarkdownLinks(markdown)).toEqual([
      'https://item.example',
      'https://lazy.example',
    ]);
  });

  it('skips inline code, of any number of backticks', () => {
    const markdown =
      'Use `[x](https://one.example)` or ``a ` [y](https://two.example)`` but [z](https://three.example).';
    expect(extractMarkdownLinks(markdown)).toEqual(['https://three.example']);
  });

  it('reads links inside block quotes, and a fence inside a list item', () => {
    const markdown = [
      '> Quoted [link](https://quoted.example).',
      '',
      '1. Step',
      '   ```',
      '   [code](https://listcode.example)',
      '   ```',
    ].join('\n');
    expect(extractMarkdownLinks(markdown)).toEqual(['https://quoted.example']);
  });

  it('ignores escaped brackets, empty destinations and links across paragraphs', () => {
    const markdown = [
      'Not \\[a link](https://escaped.example), [empty]() and [split',
      '',
      '](https://split.example).',
    ].join('\n');
    expect(extractMarkdownLinks(markdown)).toEqual([]);
  });

  it('removes backslash escapes and decodes &amp; in destinations', () => {
    expect(extractMarkdownLinks('[q](https://example.com/?a=1&amp;b=\\*2)')).toEqual([
      'https://example.com/?a=1&b=*2',
    ]);
  });

  it('lists each destination once', () => {
    expect(
      extractMarkdownLinks('[a](https://x.example) [b](https://x.example) <https://x.example>'),
    ).toEqual(['https://x.example']);
  });
});

describe('resolveLink', () => {
  const site = 'https://codeqlick.com';
  const page = `${site}/en/blog/hello`;

  it('resolves relative links against the page and marks the site’s own as internal', () => {
    expect(resolveLink('/es/work/acme', page, site)).toEqual({
      url: 'https://codeqlick.com/es/work/acme',
      internal: true,
    });
    expect(resolveLink('other-post#part', page, site)).toEqual({
      url: 'https://codeqlick.com/en/blog/other-post#part',
      internal: true,
    });
    expect(resolveLink('https://www.codeqlick.com/en/about', page, site)?.internal).toBe(true);
  });

  it('marks other hosts (subdomains included) as external', () => {
    expect(resolveLink('https://example.com/a', page, site)).toEqual({
      url: 'https://example.com/a',
      internal: false,
    });
    expect(resolveLink('https://swipe.codeqlick.com/', page, site)?.internal).toBe(false);
  });

  it('skips anchors, mailto, other schemes, invalid and overlong addresses', () => {
    expect(resolveLink('#section', page, site)).toBeNull();
    expect(resolveLink('mailto:hello@codeqlick.com', page, site)).toBeNull();
    expect(resolveLink('tel:+34600000000', page, site)).toBeNull();
    expect(resolveLink('javascript:alert(1)', page, site)).toBeNull();
    expect(resolveLink('http://exa mple.com', page, site)).toBeNull();
    expect(
      resolveLink(`https://example.com/${'a'.repeat(MAX_LINK_LENGTH)}`, page, site),
    ).toBeNull();
  });
});

describe('withoutFragment', () => {
  it('drops the fragment only', () => {
    expect(withoutFragment('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1');
  });
});
