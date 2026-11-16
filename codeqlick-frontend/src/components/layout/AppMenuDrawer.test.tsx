// @vitest-environment happy-dom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppMenuDrawer, AppMenuLink } from './AppMenuDrawer';

// The app's navigation pulls in Next.js's router, which doesn't load under Vitest: a plain link and
// a path the test sets are enough here.
const nav = vi.hoisted(() => ({ pathname: '/map' }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => nav.pathname,
  Link: ({ href, children, ...props }: ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function menu() {
  return (
    <AppMenuDrawer openLabel="Menu" closeLabel="Close menu" title="Menu">
      <nav aria-label="cruising">
        <AppMenuLink href="/cruising/map" app="cruising">
          Map
        </AppMenuLink>
        <AppMenuLink href="/cruising/places" app="cruising">
          Places
        </AppMenuLink>
      </nav>
    </AppMenuDrawer>
  );
}

function render() {
  act(() => root.render(menu()));
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
  const dialog = container.querySelector('dialog')!;
  const close = dialog.querySelector<HTMLButtonElement>('button')!;
  return { trigger, dialog, close };
}

beforeEach(() => {
  nav.pathname = '/map';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AppMenuDrawer', () => {
  it('names the button and the dialog and ties them together', () => {
    const { trigger, dialog, close } = render();
    expect(trigger.getAttribute('aria-label')).toBe('Menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe('Menu');
    expect(close.getAttribute('aria-label')).toBe('Close menu');
    expect(dialog.open).toBe(false);
  });

  it('opens as a modal, moves the focus in and stops the page scrolling', () => {
    const { trigger, dialog, close } = render();
    act(() => trigger.click());
    expect(dialog.open).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(close);
    expect(document.documentElement.hasAttribute('data-app-menu-open')).toBe(true);
  });

  it('closes on Escape and gives the focus back to the button', () => {
    const { trigger, dialog } = render();
    act(() => trigger.click());
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(document.documentElement.hasAttribute('data-app-menu-open')).toBe(false);
  });

  it('closes with the close button, on the backdrop and when a link is followed', () => {
    const { trigger, dialog, close } = render();
    act(() => trigger.click());
    act(() => close.click());
    expect(dialog.open).toBe(false);

    act(() => trigger.click());
    act(() => dialog.click());
    expect(dialog.open).toBe(false);

    act(() => trigger.click());
    const link = dialog.querySelector('a')!;
    link.addEventListener('click', (event) => event.preventDefault());
    act(() => link.click());
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when the page changes', () => {
    const { trigger, dialog } = render();
    act(() => trigger.click());
    nav.pathname = '/places';
    act(() => root.render(menu()));
    expect(dialog.open).toBe(false);
  });

  it('marks the current page', () => {
    const { dialog } = render();
    const [map, places] = dialog.querySelectorAll('a');
    expect(map!.getAttribute('aria-current')).toBe('page');
    expect(places!.hasAttribute('aria-current')).toBe(false);
  });
});
