import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getOutline } from '@/lib/markdown-outline';
import { TableOfContents } from './TableOfContents';

const render = (markdown: string) =>
  renderToStaticMarkup(<TableOfContents outline={getOutline(markdown)} title="Contents" />);

describe('TableOfContents', () => {
  it('lists each ## with its ### nested, linking to their anchors', () => {
    const html = render('## One\n\n### One a\n\n## Two\n\n## Three');
    expect(html).toMatch(/^<nav[^>]*aria-label="Contents"/);
    expect(html).toMatch(
      /<li><a href="#one">One<\/a><ol[^>]*><li><a href="#one-a">One a<\/a><\/li><\/ol><\/li>/,
    );
    expect(html).toContain('<li><a href="#three">Three</a></li>');
  });

  it('shows nothing for fewer than three ## headings', () => {
    expect(render('## One\n\n### One a\n\n### One b\n\n## Two')).toBe('');
    expect(render('Only a paragraph.')).toBe('');
  });

  it('shows plain, escaped titles and no nested list for a ## without ###', () => {
    const html = render('## Using `npm ci`\n\n## A < B & C\n\n## [Docs](https://example.com)');
    expect(html).toContain('<li><a href="#using-npm-ci">Using npm ci</a></li>');
    expect(html).toContain('<li><a href="#a-b-c">A &lt; B &amp; C</a></li>');
    expect(html).toContain('<li><a href="#docs">Docs</a></li>');
    expect(html).not.toContain('example.com');
    expect(html.match(/<ol/g)).toHaveLength(1);
  });
});
