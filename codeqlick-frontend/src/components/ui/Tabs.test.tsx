// @vitest-environment happy-dom
import { act, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabList } from './TabList';
import { Tabs } from './Tabs';

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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Tabs (links)', () => {
  it('is a named navigation of links, the current one aria-current="page"', () => {
    const html = renderToStaticMarkup(
      <Tabs
        label="Moderation"
        items={[
          { href: '/admin/users?kind=app', label: 'Queue', current: true },
          { href: '/admin/users?kind=client', label: 'Reports' },
        ]}
      />,
    );
    expect(html).toMatch(/^<nav aria-label="Moderation"><ul class="[^"]*segmented[^"]*">/);
    expect(html).toContain('<a href="/admin/users?kind=app" class="tab" aria-current="page">');
    expect(html).toContain('<a href="/admin/users?kind=client" class="tab">Reports</a>');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    // Links stay links: no tab roles to pretend otherwise.
    expect(html).not.toContain('role="tab');
  });

  it('uses the pills variant for filters', () => {
    const html = renderToStaticMarkup(
      <Tabs
        variant="pills"
        label="Status"
        items={[{ href: '/a', label: 'Open', current: true }]}
      />,
    );
    expect(html).toMatch(/<ul class="[^"]*pills/);
    expect(html).not.toMatch(/segmented/);
  });
});

describe('TabList (in place)', () => {
  let container: HTMLDivElement;
  let root: Root;

  function Views({ onChange }: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState<'edit' | 'preview' | 'code'>('edit');
    return (
      <TabList
        label="Editor views"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        items={[
          { value: 'edit', label: 'Edit', controls: 'forms' },
          { value: 'preview', label: 'View' },
          { value: 'code', label: 'Code', lang: 'en' },
        ]}
      />
    );
  }

  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const key = (target: HTMLElement, name: string) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders a named tablist with one selected tab in the tab order', () => {
    act(() => root.render(<Views />));
    const list = container.querySelector('[role="tablist"]')!;
    expect(list.getAttribute('aria-label')).toBe('Editor views');
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs()[0].getAttribute('aria-controls')).toBe('forms');
    expect(tabs()[2].getAttribute('lang')).toBe('en');
    expect(tabs().every((tab) => tab.type === 'button')).toBe(true);
  });

  it('moves and selects with the arrow keys, wrapping, and Home / End', () => {
    const changes: string[] = [];
    act(() => root.render(<Views onChange={(value) => changes.push(value)} />));
    tabs()[0].focus();
    key(tabs()[0], 'ArrowRight');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1].tabIndex).toBe(0);
    key(tabs()[1], 'End');
    expect(document.activeElement).toBe(tabs()[2]);
    key(tabs()[2], 'ArrowRight');
    expect(document.activeElement).toBe(tabs()[0]);
    key(tabs()[0], 'ArrowLeft');
    expect(document.activeElement).toBe(tabs()[2]);
    key(tabs()[2], 'Home');
    expect(document.activeElement).toBe(tabs()[0]);
    expect(changes).toEqual(['preview', 'code', 'edit', 'code', 'edit']);
  });

  it('selects on click and ignores other keys', () => {
    const changes: string[] = [];
    act(() => root.render(<Views onChange={(value) => changes.push(value)} />));
    act(() => tabs()[1].click());
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    key(tabs()[1], 'a');
    expect(changes).toEqual(['preview']);
  });
});
