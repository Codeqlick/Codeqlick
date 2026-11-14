import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NewsMarkdown, parseNewsInline, parseNewsMarkdown, safeNewsHref } from './news-markdown';

const render = (source: string) => renderToStaticMarkup(<NewsMarkdown source={source} />);

describe('the news body’s Markdown subset', () => {
  it('splits paragraphs at blank lines and keeps the line breaks inside one', () => {
    expect(parseNewsMarkdown('One\ntwo\n\n\nThree')).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', value: 'One' }, { type: 'br' }, { type: 'text', value: 'two' }],
      },
      { type: 'paragraph', children: [{ type: 'text', value: 'Three' }] },
    ]);
    expect(parseNewsMarkdown('  \n')).toEqual([]);
  });

  it('renders bold, italic and nesting', () => {
    expect(render('A **bold** and *italic* and **bold *and italic* inside**')).toBe(
      '<div><p>A <strong>bold</strong> and <em>italic</em> and <strong>bold <em>and italic</em> inside</strong></p></div>',
    );
  });

  it('leaves unclosed or empty markers as text', () => {
    expect(render('2 * 3 and **open and ** and *')).toBe(
      '<div><p>2 * 3 and **open and ** and *</p></div>',
    );
  });

  it('renders lists, ending them at a blank or ordinary line', () => {
    expect(render('Offers:\n- Cut\n- *Dye*\n\n-not an item\nafter')).toBe(
      '<div><p>Offers:</p><ul><li>Cut</li><li><em>Dye</em></li></ul><p>-not an item<br/>after</p></div>',
    );
    expect(render('- one\ntext')).toBe('<div><ul><li>one</li></ul><p>text</p></div>');
  });

  it('links http, https, mailto and tel, external ones with rel', () => {
    const html = render(
      '[web](https://example.com/a?b=1) [mail](mailto:hello@codeqlick.com) [call](tel:+34600111222)',
    );
    expect(html).toContain(
      '<a href="https://example.com/a?b=1" target="_blank" rel="noopener nofollow ugc">web</a>',
    );
    expect(html).toContain('<a href="mailto:hello@codeqlick.com">mail</a>');
    expect(html).toContain('<a href="tel:+34600111222">call</a>');
  });

  it('keeps links with other addresses as the text typed', () => {
    const html = render(
      '[x](javascript:alert(1)) [y](data:text/html,hi) [z](/relative) [w](ftp://a.b)',
    );
    expect(html).not.toContain('<a');
    expect(html).toContain('[x](javascript:alert(1');
    expect(parseNewsInline('[go](javascript:evil)')).toEqual([
      { type: 'text', value: '[go](javascript:evil)' },
    ]);
  });

  it('escapes everything: HTML and images are only text', () => {
    const html = render('<script>alert(1)</script> <b>x</b> ![a](https://a.b/c.png) "q" & more');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&amp; more');
    expect(html).toContain('&quot;q&quot;');
  });

  it('does not let a link label break out of its tag', () => {
    const html = render('[<img src=x onerror=alert(1)>](https://example.com)');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('accepts only safe addresses', () => {
    expect(safeNewsHref('https://example.com')).toBe('https://example.com');
    expect(safeNewsHref('http://example.com')).toBe('http://example.com');
    expect(safeNewsHref('mailto:a@b.es')).toBe('mailto:a@b.es');
    expect(safeNewsHref('tel:600111222')).toBe('tel:600111222');
    expect(safeNewsHref('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
    expect(safeNewsHref('javascript:alert(1)')).toBeNull();
    expect(safeNewsHref('https://exa mple.com')).toBeNull();
    expect(safeNewsHref('https://')).toBeNull();
    expect(safeNewsHref('example.com')).toBeNull();
    expect(safeNewsHref('//example.com')).toBeNull();
  });
});
