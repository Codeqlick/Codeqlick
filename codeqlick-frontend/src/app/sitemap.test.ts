import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'codeqlick.com' }),
}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@/lib/api/posts', () => ({
  listPosts: async () => ({ items: [] }),
  PUBLIC_REVALIDATE: 300,
}));
vi.mock('@/lib/api/portfolio', () => ({ listPortfolio: async () => ({ items: [] }) }));
vi.mock('@/lib/api/calculator', () => ({ getCalculator: async () => null }));
vi.mock('@/lib/api/bookings', () => ({ getBookingSlots: async () => null }));

const { default: sitemap } = await import('./sitemap');

describe('the website’s sitemap', () => {
  it('lists the local service pages and the web design hub in both languages (decision 121)', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://codeqlick.com/en/services/web-design');
    expect(urls).toContain('https://codeqlick.com/es/services/web-design');
    expect(urls).toContain('https://codeqlick.com/en/services/custom-software/madrid');
    expect(urls).toContain('https://codeqlick.com/es/services/maintenance-and-support/palma');
    const local = urls.filter((url) => /\/services\/[^/]+\/[^/]+$/.test(url));
    expect(local).toHaveLength(80);
  });

  it('links each local page to its other language', async () => {
    const entry = (await sitemap()).find(
      (item) => item.url === 'https://codeqlick.com/es/services/mobile-and-pwa/bilbao',
    );
    expect(entry?.alternates?.languages).toEqual({
      en: 'https://codeqlick.com/en/services/mobile-and-pwa/bilbao',
      es: 'https://codeqlick.com/es/services/mobile-and-pwa/bilbao',
    });
  });
});
