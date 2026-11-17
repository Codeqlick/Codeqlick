import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => undefined,
}));
vi.mock('@/lib/api/calculator', () => ({ getCalculator: async () => null }));

const { generateMetadata, generateStaticParams, dynamicParams } = await import('./page');

const params = (locale: string, slug: string, city: string) => ({
  params: Promise.resolve({ locale, slug, city }),
});

describe('local service page metadata (decision 121)', () => {
  it('builds 80 pages ahead of time and nothing else', () => {
    const all = generateStaticParams();
    expect(all).toHaveLength(80);
    expect(all).toContainEqual({ locale: 'es', slug: 'web-design', city: 'malaga' });
    expect(dynamicParams).toBe(false);
  });

  it('has its own title, description, canonical, hreflang and generated image', async () => {
    const metadata = await generateMetadata(params('es', 'custom-software', 'zaragoza'));
    expect(metadata.title).toBe('Software a medida en Zaragoza');
    expect(metadata.description).toMatch(/^Las empresas de logística y distribución de Zaragoza/);
    expect(metadata.alternates).toEqual({
      canonical: '/es/services/custom-software/zaragoza',
      languages: {
        en: '/en/services/custom-software/zaragoza',
        es: '/es/services/custom-software/zaragoza',
        'x-default': '/en/services/custom-software/zaragoza',
      },
    });
    expect(metadata.openGraph).toMatchObject({
      url: '/es/services/custom-software/zaragoza',
      locale: 'es_ES',
      images: [
        {
          url: '/es/services/custom-software/zaragoza/og',
          width: 1200,
          height: 630,
          alt: 'Software a medida en Zaragoza',
        },
      ],
    });
  });

  it('is a 404 for an unknown service or city', async () => {
    await expect(generateMetadata(params('en', 'ui-ux-design', 'madrid'))).rejects.toThrow();
    await expect(generateMetadata(params('en', 'web-design', 'paris'))).rejects.toThrow();
  });
});
