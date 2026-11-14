import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getOutline } from '@/lib/markdown-outline';
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

  it('keeps headings without ids or links when anchors are off', () => {
    const html = render('## Plan\n\n### Step one\n\nText.');
    expect(html).toContain('<h2>Plan</h2>');
    expect(html).toContain('<h3>Step one</h3>');
    expect(html).not.toContain('id=');
  });

  it('lazy-loads images and always gives them an alt attribute', () => {
    const html = render('![](https://codeqlick.com/media/a.png)');
    expect(html).toMatch(/<img[^>]*src="https:\/\/codeqlick\.com\/media\/a\.png"/);
    expect(html).toContain('alt=""');
    expect(html).toContain('loading="lazy"');
  });
});

describe('Markdown with anchors', () => {
  const renderAnchored = (markdown: string) =>
    renderToStaticMarkup(
      <Markdown anchors={{ linkLabel: 'Link to this section' }}>{markdown}</Markdown>,
    );

  it('gives ## and ### an id and a "#" link to it, and nothing to other headings', () => {
    const html = renderAnchored('# Title\n\n## Cómo *empezar*\n\n### Paso 1\n\n#### Detail');
    expect(html).toMatch(
      /<h2 id="como-empezar"[^>]*>Cómo <em>empezar<\/em><a href="#como-empezar"[^>]*aria-label="Link to this section"[^>]*>#<\/a><\/h2>/,
    );
    expect(html).toMatch(/<h3 id="paso-1"[^>]*>Paso 1<a href="#paso-1"/);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h4>Detail</h4>');
  });

  it('renders the same ids as the outline, repeated headings included', () => {
    const markdown = [
      '## Intro',
      '### Setup',
      '## Usage',
      '### Setup',
      '## Intro',
      '## `code` & [links](https://example.com)',
    ].join('\n\n');
    const html = renderAnchored(markdown);
    const rendered = [...html.matchAll(/<h[23] id="([^"]+)"/g)].map((match) => match[1]);
    const outlined = getOutline(markdown).flatMap((entry) => [
      entry.id,
      ...entry.children.map((child) => child.id),
    ]);
    expect(rendered).toEqual(['intro', 'setup', 'usage', 'setup-2', 'intro-2', 'code-links']);
    expect(rendered).toEqual(outlined);
  });

  it('keeps the outline ids after a numbered collision and with raw HTML in a heading', () => {
    const markdown = '## Notes\n\n## Notes\n\n## Notes 2\n\n## Diseño <b>web</b>';
    const html = renderAnchored(markdown);
    const rendered = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((match) => match[1]);
    expect(rendered).toEqual(['notes', 'notes-2', 'notes-2-2', 'diseno-web']);
    expect(rendered).toEqual(getOutline(markdown).map((entry) => entry.id));
    // skipHtml still drops the tags: the heading shows only their text.
    expect(html).not.toContain('<b>');
    expect(html).toMatch(/<h2 id="diseno-web"[^>]*>Diseño web<a href="#diseno-web"/);
  });
});
