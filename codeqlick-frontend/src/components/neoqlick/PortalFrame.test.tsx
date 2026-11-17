import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { PortalFrame } from './PortalFrame';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/brand/Logo', () => ({ Logo: () => <span>logo</span> }));
vi.mock('@/components/layout/LocaleSwitcher', () => ({ LocaleSwitcher: () => null }));
vi.mock('@/lib/env', () => ({ neoqlickLegalOwner: undefined }));
vi.mock('@/lib/portal-links', () => ({
  neoqlickAccountUrl: () => 'https://account.neoqlick.com',
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    key === 'copyright' ? en.Neoqlick.copyright.replace('{year}', String(values?.year)) : key,
}));

describe('PortalFrame', () => {
  it('shows the tagline in the footer, in English, away from the logo', async () => {
    const html = renderToStaticMarkup(await PortalFrame({ locale: 'es', children: null }));
    const at = html.indexOf('<footer');
    expect(html.slice(at)).toContain('Closer than you think');
    expect(html.slice(at)).toContain('lang="en"');
    expect(html.slice(0, at)).not.toContain('Closer than you think');
  });
});
