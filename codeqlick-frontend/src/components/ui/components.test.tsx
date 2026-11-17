import type { ComponentProps } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Card, CardLink } from './Card';
import { EmptyState } from './EmptyState';
import { FilterBar } from './FilterBar';
import { Stat, StatGrid } from './Stat';

// The app's navigation pulls in Next.js's router, which doesn't load under Vitest.
/** The markup with CSS Modules' hashed names (`_stat_1a2b3c`) back to the source's (`stat`). */
const renderToStaticMarkup = (element: Parameters<typeof renderMarkup>[0]) =>
  renderMarkup(element).replace(/_([a-zA-Z]+)_[0-9a-f]{6}/g, '$1');

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const text = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

describe('Stat', () => {
  it('lists counters, number first, then the label', () => {
    const html = renderToStaticMarkup(
      <StatGrid label="Totals">
        <Stat value={12} label="New leads" />
      </StatGrid>,
    );
    expect(html).toMatch(
      /^<ul class="grid" aria-label="Totals"><li class="item"><div class="stat">/,
    );
    expect(text(html)).toBe('|12|New leads|');
  });

  it('makes the whole counter the link when it has one', () => {
    const html = renderToStaticMarkup(<Stat value={3} label="Drafts" href="/admin/drafts" />);
    expect(html).toContain('<a href="/admin/drafts" class="stat">');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it('dims a zero, as a number or as text', () => {
    expect(renderToStaticMarkup(<Stat value={0} label="Reports" />)).toContain('class="stat zero"');
    expect(renderToStaticMarkup(<Stat value="0" label="Reports" />)).toContain('class="stat zero"');
    expect(renderToStaticMarkup(<Stat value="0 B" label="Disk" />)).not.toContain('zero');
  });

  it('adds the note, coloured by the trend', () => {
    const html = renderToStaticMarkup(
      <Stat value={5} label="Views" note="2 the week before" trend="up" />,
    );
    expect(html).toContain('<span class="note up">2 the week before</span>');
    expect(
      renderToStaticMarkup(<Stat value={5} label="Views" note="5 before" trend="same" />),
    ).toContain('<span class="note">5 before</span>');
  });
});

describe('Card interactive', () => {
  it('stretches its one link over the card', () => {
    const html = renderToStaticMarkup(
      <Card as="li" interactive>
        <h2>
          <CardLink href="/portal/projects/1">Shop</CardLink>
        </h2>
        <p>Design</p>
      </Card>,
    );
    expect(html).toMatch(/^<li class="card interactive">/);
    expect(html).toContain('<a href="/portal/projects/1" class="cardLink">Shop</a>');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it('is a plain card without the flag, and an external card link is a plain anchor', () => {
    expect(renderToStaticMarkup(<Card bordered>x</Card>)).toBe(
      '<div class="card bordered">x</div>',
    );
    expect(
      renderToStaticMarkup(
        <CardLink href="https://cloud.codeqlick.com" external>
          Cloud
        </CardLink>,
      ),
    ).toBe('<a href="https://cloud.codeqlick.com" class="cardLink">Cloud</a>');
  });
});

describe('FilterBar', () => {
  it('is a GET form in a search landmark, the actions last', () => {
    const html = renderToStaticMarkup(
      <FilterBar label="Filter leads" actions={<button type="submit">Filter</button>}>
        <input name="q" type="search" />
      </FilterBar>,
    );
    expect(html).toBe(
      '<search aria-label="Filter leads"><form class="bar" method="get">' +
        '<input type="search" name="q"/>' +
        '<div class="actions"><button type="submit">Filter</button></div></form></search>',
    );
  });

  it('passes other form attributes through', () => {
    const html = renderToStaticMarkup(
      <FilterBar action="/admin/users" className="extra">
        <input name="q" />
      </FilterBar>,
    );
    expect(html).toContain('<form class="bar extra" action="/admin/users" method="get">');
    expect(html).not.toContain('class="actions"');
  });
});

describe('EmptyState', () => {
  it('shows the brand symbol, title, text and one action', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="No trips yet"
        body="Announce one from a city page."
        action={<button type="button">Add a trip</button>}
      />,
    );
    expect(html).toContain('<span class="icon" aria-hidden="true"><svg');
    expect(text(html)).toBe('|No trips yet|Announce one from a city page.|Add a trip|');
    expect(html).toContain('<h2 class="title">No trips yet</h2>');
  });

  it('leaves the icon out with null, uses another, and an h3 when asked', () => {
    const none = renderToStaticMarkup(<EmptyState title="Nothing" icon={null} headingLevel={3} />);
    expect(none).toBe('<div class="empty"><h3 class="title">Nothing</h3></div>');
    const own = renderToStaticMarkup(<EmptyState title="Nothing" icon={<b>!</b>} />);
    expect(own).toContain('<span class="icon" aria-hidden="true"><b>!</b></span>');
  });
});
