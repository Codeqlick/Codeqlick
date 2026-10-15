import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

const render = (markdown: string) => renderToStaticMarkup(<Markdown>{markdown}</Markdown>);

describe('Markdown', () => {
  it('renders Markdown, not the raw HTML inside it', () => {
    const html = render('## Title\n\nSome **bold**.\n\n<script>alert(1)</script>\n\n<b>raw</b>');
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>raw</b>');
  });

  it('drops unsafe link targets and opens external links in a new tab', () => {
    const html = render(
      '[x](javascript:alert(1)) [site](/es/contact) [ext](https://example.com) [mail](mailto:hello@codeqlick.com)',
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a href="/es/contact">site</a>');
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ext</a>',
    );
    expect(html).toContain('<a href="mailto:hello@codeqlick.com">mail</a>');
  });

  it('lazy-loads images and always gives them an alt attribute', () => {
    const html = render('![](https://codeqlick.com/media/a.png)');
    expect(html).toMatch(/<img[^>]*src="https:\/\/codeqlick\.com\/media\/a\.png"/);
    expect(html).toContain('alt=""');
    expect(html).toContain('loading="lazy"');
  });
});
