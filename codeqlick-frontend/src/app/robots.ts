import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/*/admin', '/*/portal', '/*/login', '/*/forgot-password', '/*/reset-password'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
