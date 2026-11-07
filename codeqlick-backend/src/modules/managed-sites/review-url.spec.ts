import { describe, expect, it } from 'vitest';
import { siteContentSchema } from './managed-sites.schemas.js';

const reviewUrl = siteContentSchema.shape.contact.shape.reviewUrl;

describe('the Google review link', () => {
  it.each([
    'https://g.page/r/CdA1b2C3d4E5EAE/review',
    'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    'https://maps.app.goo.gl/AbCdEf123',
    'https://www.google.es/maps/place/Peluqueria',
    'https://www.google.co.uk/maps/place/Peluqueria',
  ])('takes %s', (url) => {
    expect(reviewUrl.safeParse(url).success).toBe(true);
  });

  it.each([
    'http://g.page/r/CdA1b2C3d4E5EAE/review',
    'https://example.com/review',
    'https://g.page.example.com/r/x',
    'https://google.com.evil.io/x',
    'https://www.google.ev.il/x',
    'not a link',
  ])('refuses %s', (url) => {
    expect(reviewUrl.safeParse(url).success).toBe(false);
  });
});
