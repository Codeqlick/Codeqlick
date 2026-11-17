// @vitest-environment happy-dom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link } from '@/i18n/navigation';
import { AppMenuDrawer, AppMenuLink } from './AppMenuDrawer';

// The app's navigation pulls in Next.js's router, which doesn't load under Vitest: a plain link and
// a path the test sets are enough here.
const nav = vi.hoisted(() => ({ pathname: '/console' }));
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
      <section aria-label="Your account">
        <Link href="/login">Sign in</Link>
        <Link href="/register">Create account</Link>
      </section>
      <nav aria-label="cloud">
        <AppMenuLink href="/cloud/console" app="cloud">
          Console
        </AppMenuLink>
        <AppMenuLink href="/cloud/docs" app="cloud">
          Docs
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
  nav.pathname = '/console';
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
    nav.pathname = '/docs';
    act(() => root.render(menu()));
    expect(dialog.open).toBe(false);
  });

  it('shows the user card first in the drawer, with its buttons', () => {
    const { dialog } = render();
    const card = dialog.querySelector('section[aria-label="Your account"]')!;
    expect(card).not.toBeNull();
    expect(dialog.querySelector('a')!.closest('section')).toBe(card);
    expect([...card.querySelectorAll('a')].map((link) => link.textContent)).toEqual([
      'Sign in',
      'Create account',
    ]);
  });

  it('signed in: the avatar sits in the one trigger, named after the person', () => {
    act(() =>
      root.render(
        <AppMenuDrawer
          openLabel="Menu — Ana Gil"
          closeLabel="Close menu"
          title="Menu"
          avatar={<span className="avatar">AG</span>}
        >
          <section aria-label="Your account">
            <p>Ana Gil</p>
            <Link href="/cloud/console">My profile</Link>
            <a href="https://codeqlick.com/es/portal/account">My account</a>
          </section>
        </AppMenuDrawer>,
      ),
    );
    const triggers = container.querySelectorAll('button[aria-haspopup="dialog"]');
    expect(triggers).toHaveLength(1);
    const trigger = triggers[0] as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toBe('Menu — Ana Gil');
    const avatar = trigger.querySelector('.avatar')!;
    expect(avatar.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('dialog')).toHaveLength(1);
    act(() => trigger.click());
    const links = [...container.querySelectorAll('dialog a')].map((link) => link.textContent);
    expect(links).toEqual(['My profile', 'My account']);
  });

  it('marks the current page', () => {
    const { dialog } = render();
    const [console, docs] = dialog.querySelectorAll('nav a');
    expect(console!.getAttribute('aria-current')).toBe('page');
    expect(docs!.hasAttribute('aria-current')).toBe(false);
  });
});
