import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from './PageHeader';

// The app's navigation pulls in Next.js's router, which doesn't load under Vitest.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const text = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

describe('PageHeader', () => {
  it('renders the one H1 with only the parts it is given', () => {
    const html = renderToStaticMarkup(<PageHeader title="Console" />);
    expect(html).toMatch(/^<header[^>]*><div[^>]*><h1[^>]*>Console<\/h1><\/div><\/header>$/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('puts back link, eyebrow, title, meta, lead and extra in that order, then the actions', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        back={{ href: '/cloud/console', label: 'Console' }}
        eyebrow="Codeqlick Cloud"
        title="API tokens"
        meta={<span>Read only</span>}
        lead="Tokens let the CLI deploy."
        actions={<button type="button">New token</button>}
      >
        <p>Warning</p>
      </PageHeader>,
    );
    expect(text(html)).toBe(
      '|←| Console|Codeqlick Cloud|API tokens|Read only|Tokens let the CLI deploy.|Warning|New token|',
    );
    expect(html).toContain('<a href="/cloud/console"');
    expect(html).toContain('<span aria-hidden="true">←</span>');
    expect(html).toMatch(/<p class="eyebrow [^"]*">Codeqlick Cloud<\/p>/);
  });

  it("shows a landing's status line between the eyebrow and the title", () => {
    const html = renderToStaticMarkup(
      <PageHeader eyebrow="Meetings" status={<p>12 online</p>} title="Meet people" />,
    );
    expect(text(html)).toBe('|Meetings|12 online|Meet people|');
  });

  it('marks the hero variant and keeps the caller’s class and title id', () => {
    const hero = renderToStaticMarkup(
      <PageHeader variant="hero" title="Citas" titleId="t" className="mine" />,
    );
    const page = renderToStaticMarkup(<PageHeader title="Citas" />);
    const classOf = (html: string) => html.match(/^<header class="([^"]*)"/)?.[1].split(' ') ?? [];
    expect(classOf(hero)).toHaveLength(3);
    expect(classOf(hero)).toContain('mine');
    expect(classOf(page)).toHaveLength(1);
    expect(hero).toContain('<h1 id="t"');
  });
});
