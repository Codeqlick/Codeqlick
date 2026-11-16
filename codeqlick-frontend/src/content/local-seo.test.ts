import { describe, expect, it } from 'vitest';
import { SERVICE_SLUGS } from '@/components/content/services';
import { SITE_LOCALES } from '@/i18n/routing';
import type { CalculatorConfig } from '@/lib/calculator';
import {
  CITIES,
  LOCAL_SERVICES,
  cityBySlug,
  localPageDescription,
  localPageFaq,
  localPageIntro,
  localPageJsonLd,
  localPageParams,
  localPageTitle,
  localPriceFrom,
  localSeoPaths,
  localServiceBySlug,
} from './local-seo';

const PAGES = SITE_LOCALES.flatMap((locale) =>
  LOCAL_SERVICES.flatMap((service) => CITIES.map((city) => ({ locale, service, city }))),
);

/** Lower case without accents, to look for a city's name in a sentence. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

describe('local service pages (decision 121)', () => {
  it('lists four services and ten cities, every pair once', () => {
    expect(LOCAL_SERVICES.map((service) => service.slug)).toEqual([
      'web-design',
      'custom-software',
      'mobile-and-pwa',
      'maintenance-and-support',
    ]);
    expect(CITIES.map((city) => city.slug)).toEqual([
      'madrid',
      'barcelona',
      'valencia',
      'sevilla',
      'malaga',
      'bilbao',
      'zaragoza',
      'alicante',
      'murcia',
      'palma',
    ]);
    const params = localPageParams();
    expect(params).toHaveLength(40);
    expect(new Set(params.map((p) => `${p.slug}/${p.city}`)).size).toBe(40);
  });

  it('reuses the service pages’ slugs for the services that have one', () => {
    for (const service of LOCAL_SERVICES) {
      if (service.key === 'website') continue;
      expect(service.slug).toBe(SERVICE_SLUGS[service.key]);
    }
  });

  it('uses URL-safe slugs and finds each service and city by its slug', () => {
    for (const service of LOCAL_SERVICES) {
      expect(service.slug).toMatch(/^[a-z-]+$/);
      expect(localServiceBySlug(service.slug)).toBe(service);
    }
    for (const city of CITIES) {
      expect(city.slug).toMatch(/^[a-z-]+$/);
      expect(cityBySlug(city.slug)).toBe(city);
    }
    expect(localServiceBySlug('ui-ux-design')).toBeUndefined();
    expect(cityBySlug('paris')).toBeUndefined();
  });

  it('has every text in both languages', () => {
    for (const locale of SITE_LOCALES) {
      for (const service of LOCAL_SERVICES) {
        expect(service.name[locale]).toBeTruthy();
        expect(service.process[locale]).toHaveLength(4);
        expect(service.faq[locale]).toHaveLength(3);
        for (const item of service.faq[locale]) {
          expect(item.q).toBeTruthy();
          expect(item.a).toBeTruthy();
        }
      }
      for (const city of CITIES) {
        expect(city.name[locale]).toBeTruthy();
        expect(city.context[locale].length).toBeGreaterThan(120);
        for (const service of LOCAL_SERVICES) {
          expect(city.angles[service.key][locale]).toBeTruthy();
        }
      }
    }
    // The Spanish and English versions are not the same text.
    for (const city of CITIES) expect(city.context.es).not.toBe(city.context.en);
  });

  it('writes each service sentence for its city: it names the city', () => {
    for (const { locale, service, city } of PAGES) {
      expect(plain(city.angles[service.key][locale])).toContain(plain(city.name[locale]));
    }
  });

  it('gives no two pages the same title, description or intro', () => {
    const titles = PAGES.map(({ locale, service, city }) => localPageTitle(locale, service, city));
    const descriptions = PAGES.map(({ locale, service, city }) =>
      localPageDescription(locale, service, city),
    );
    const intros = PAGES.map(({ locale, service, city }) =>
      localPageIntro(locale, service, city).join(' '),
    );
    expect(new Set(titles).size).toBe(PAGES.length);
    expect(new Set(descriptions).size).toBe(PAGES.length);
    expect(new Set(intros).size).toBe(PAGES.length);
    // Each city's context and each service sentence is written once, not reused.
    const contexts = SITE_LOCALES.flatMap((locale) => CITIES.map((city) => city.context[locale]));
    expect(new Set(contexts).size).toBe(contexts.length);
  });

  it('keeps titles and descriptions to what search results show', () => {
    for (const { locale, service, city } of PAGES) {
      expect(localPageTitle(locale, service, city).length).toBeLessThanOrEqual(50);
      const description = localPageDescription(locale, service, city);
      expect(description.length).toBeGreaterThanOrEqual(80);
      expect(description.length).toBeLessThanOrEqual(185);
    }
    expect(localPageTitle('es', LOCAL_SERVICES[0]!, CITIES[0]!)).toBe(
      'Diseño web en Madrid desde 200 €',
    );
    expect(localPageTitle('en', LOCAL_SERVICES[1]!, CITIES[3]!)).toBe('Custom software in Seville');
  });

  it('never claims an office or an address in the city', () => {
    for (const { locale, service, city } of PAGES) {
      const text = plain(
        [
          ...localPageIntro(locale, service, city),
          ...localPageFaq(locale, service, city).map((item) => `${item.q} ${item.a}`),
        ].join(' '),
      );
      expect(text).not.toMatch(/\b(our|nuestra) (office|oficina)\b/);
      // No postcode, street address or phone number.
      expect(text).not.toMatch(/\b\d{5}\b/);
      expect(text).not.toMatch(/\b(c\/|calle|avenida|avda)\s/);
      expect(text).not.toMatch(/\+34|\b[6-9]\d{8}\b/);
    }
  });

  it('asks the service’s three questions plus the city’s, which says it works remotely', () => {
    const faq = localPageFaq('es', LOCAL_SERVICES[2]!, cityBySlug('bilbao')!);
    expect(faq).toHaveLength(4);
    expect(faq[3]!.q).toBe('¿Tenéis oficina en Bilbao?');
    expect(faq[3]!.a).toMatch(/^No\. Codeqlick trabaja en remoto/);
    expect(localPageFaq('en', LOCAL_SERVICES[0]!, cityBySlug('malaga')!)[3]!.q).toBe(
      'Do you have an office in Málaga?',
    );
  });

  it('lists the web design hub and the 40 pages for the sitemap', () => {
    const paths = localSeoPaths();
    expect(paths).toHaveLength(41);
    expect(paths[0]).toBe('/services/web-design');
    expect(paths).toContain('/services/maintenance-and-support/palma');
    expect(paths).toContain('/services/web-design/sevilla');
  });
});

describe('price from', () => {
  const calculator: CalculatorConfig = {
    enabled: true,
    types: {
      web: { min: 8000, max: 15000, weeksMin: 6, weeksMax: 10 },
      custom: { min: 6000, max: 12000, weeksMin: 4, weeksMax: 8 },
      mobile: { min: 7000, max: 14000, weeksMin: 6, weeksMax: 10 },
      design: { min: 2000, max: 4000, weeksMin: 2, weeksMax: 4 },
      support: { min: 0, max: 0, weeksMin: 0, weeksMax: 0 },
    },
    sizes: { small: 0.5, medium: 1, large: 2 },
    extras: {
      languages: { min: 0, max: 0 },
      accounts: { min: 0, max: 0 },
      payments: { min: 0, max: 0 },
      admin: { min: 0, max: 0 },
      integrations: { min: 0, max: 0 },
    },
  };
  const service = (slug: string) => localServiceBySlug(slug)!;

  it('is the basic website’s €200 for web design, with or without the calculator', () => {
    expect(localPriceFrom(service('web-design'), null)).toBe(200);
    expect(localPriceFrom(service('web-design'), calculator)).toBe(200);
  });

  it('is the calculator’s small size for the others', () => {
    expect(localPriceFrom(service('custom-software'), calculator)).toBe(3000);
    expect(localPriceFrom(service('mobile-and-pwa'), calculator)).toBe(3500);
  });

  it('is unknown while the calculator is unpublished or the service isn’t priced', () => {
    expect(localPriceFrom(service('custom-software'), null)).toBeNull();
    expect(localPriceFrom(service('maintenance-and-support'), calculator)).toBeNull();
  });
});

describe('structured data', () => {
  const service = localServiceBySlug('web-design')!;
  const city = cityBySlug('sevilla')!;
  const [main, breadcrumb] = localPageJsonLd({
    locale: 'es',
    service,
    city,
    siteUrl: 'https://codeqlick.com',
    servicesLabel: 'Servicios',
    price: 200,
  });

  it('describes a Service in the city, offered by a ProfessionalService with no address', () => {
    expect(main).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Diseño web en Sevilla desde 200 €',
      serviceType: 'Diseño web',
      url: 'https://codeqlick.com/es/services/web-design/sevilla',
      areaServed: {
        '@type': 'City',
        name: 'Sevilla',
        containedInPlace: { '@type': 'Country', name: 'España' },
      },
      provider: {
        '@type': 'ProfessionalService',
        name: 'Codeqlick',
        url: 'https://codeqlick.com/es',
        email: 'hello@codeqlick.com',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        priceSpecification: { '@type': 'PriceSpecification', minPrice: 200 },
      },
    });
    const json = JSON.stringify(main);
    expect(json).not.toContain('address');
    expect(json).not.toContain('LocalBusiness');
  });

  it('leaves the offer out when the price is unknown', () => {
    const [withoutPrice] = localPageJsonLd({
      locale: 'en',
      service: localServiceBySlug('custom-software')!,
      city,
      siteUrl: 'https://codeqlick.com',
      servicesLabel: 'Services',
      price: null,
    });
    expect(withoutPrice).not.toHaveProperty('offers');
    expect(withoutPrice).toMatchObject({
      name: 'Custom software in Seville',
      areaServed: { name: 'Seville', containedInPlace: { name: 'Spain' } },
    });
  });

  it('has a three-step breadcrumb', () => {
    expect(breadcrumb).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Servicios',
          item: 'https://codeqlick.com/es/services',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Diseño web',
          item: 'https://codeqlick.com/es/services/web-design',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Sevilla',
          item: 'https://codeqlick.com/es/services/web-design/sevilla',
        },
      ],
    });
  });
});
