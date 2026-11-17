import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { AppFooter } from './AppFooter';

const state = vi.hoisted(() => ({ legal: true as boolean }));

// The footer's links come from `appFooter`; only the outside world is replaced here.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: ComponentProps<'a'> & { href: string }) => (
    <a data-route="" href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/env', () => ({
  env: { SITE_URL: 'https://codeqlick.com' },
  get legalOwner() {
    return state.legal ? { name: 'Codeqlick' } : null;
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => {
    let node: unknown = en;
    for (const part of key.split('.')) node = (node as Record<string, unknown>)[part];
    return String(node).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name]));
  },
}));

async function render(props: ComponentProps<typeof AppFooter>) {
  return renderToStaticMarkup(await AppFooter(props));
}

/** [label, href, internal route?] of each link. */
function links(html: string) {
  return [...html.matchAll(/<a( data-route="")? href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [
    m[3],
    m[2],
    Boolean(m[1]),
  ]);
}

describe('AppFooter', () => {
  beforeEach(() => {
    state.legal = true;
  });

  it('shows the year and a named list of links', async () => {
    const html = await render({ app: 'meetings', locale: 'en' });
    expect(html).toMatch(/^<footer/);
    expect(html).toContain(`© ${new Date().getFullYear()} Codeqlick`);
    expect(html).toContain('<nav aria-label="Footer links">');
  });

  it("gives Cruising its own legal pages as routes and the website's contact", async () => {
    expect(links(await render({ app: 'cruising', locale: 'es' }))).toEqual([
      [en.Cruising.footerTakedown, '/cruising/takedown', true],
      [en.Cruising.nav.rules, '/cruising/rules', true],
      [en.Cruising.legal.terms, '/cruising/terms-of-use', true],
      [en.Cruising.legal.privacy, '/cruising/privacy-policy', true],
      ['Contact', 'https://codeqlick.com/es/contact', false],
    ]);
  });

  it("gives Citas, Meetings and Videochat the website's terms, privacy and contact", async () => {
    expect(links(await render({ app: 'citas', locale: 'en' }))).toEqual([
      ['Terms', 'https://codeqlick.com/en/terms', false],
      ['Privacy', 'https://codeqlick.com/en/privacy', false],
      ['Contact', 'https://codeqlick.com/en/contact', false],
    ]);
    const videochat = links(await render({ app: 'videochat', locale: 'en' }));
    expect(videochat.map(([label]) => label)).toEqual([
      en.Videochat.rulesLink,
      'Terms',
      'Privacy',
      'Contact',
    ]);
  });

  it("leaves out the website's legal pages while they don't exist", async () => {
    state.legal = false;
    expect(links(await render({ app: 'meetings', locale: 'en' }))).toEqual([
      ['Contact', 'https://codeqlick.com/en/contact', false],
    ]);
  });

  it('gives Cloud its docs (outside when they live apart), terms and abuse report', async () => {
    const html = await render({ app: 'cloud', locale: 'en', docsHref: 'https://docs.example.com' });
    expect(links(html).slice(0, 3)).toEqual([
      [en.Cloud.nav.docs, 'https://docs.example.com', false],
      [en.Cloud.terms.metaTitle, '/cloud/terms-of-use', true],
      [en.Cloud.report.title, '/cloud/report', true],
    ]);
  });
});
