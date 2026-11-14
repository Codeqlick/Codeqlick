import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { SERVICE_SLUGS, SERVICES } from '@/components/content/services';
import { legalDocument } from '@/content/legal';
import { securityPage } from '@/content/security';
import { listPortfolio } from '@/lib/api/portfolio';
import { listPosts, PUBLIC_REVALIDATE } from '@/lib/api/posts';
import { env, legalOwner } from '@/lib/env';
import { buildLlmsTxt, firstSentence, LLMS_LIST_SIZE } from '@/lib/llms-txt';
import { CONTACT_EMAIL, SITE_NAME, TAGLINE } from '@/lib/site';
import { webappUrl } from '@/lib/webapp-seo';
import { webappForHost } from '@/lib/webapps';

/** The file is in English and links the English pages. */
const LOCALE = 'en';

/** Published content for the file; null when the API can't be read (the section is left out). */
async function published<T>(load: () => Promise<{ items: T[] }>): Promise<T[] | null> {
  try {
    return (await load()).items;
  } catch {
    return null;
  }
}

/**
 * /llms.txt (architecture 6.2): a Markdown map of the website for AI assistants. Per request, like
 * the sitemap: it depends on the host, and the content comes from the API (cached for
 * PUBLIC_REVALIDATE seconds by the fetches). A web app's host has none.
 */
export async function GET() {
  await connection();
  if (webappForHost((await headers()).get('host'))) {
    return new Response('Not found', { status: 404 });
  }

  const [meta, home, services, basic, request, cloud, check, work, blog, about, contact] =
    await Promise.all([
      getTranslations({ locale: LOCALE, namespace: 'Metadata' }),
      getTranslations({ locale: LOCALE, namespace: 'Home' }),
      getTranslations({ locale: LOCALE, namespace: 'Services' }),
      getTranslations({ locale: LOCALE, namespace: 'BasicWebsite' }),
      getTranslations({ locale: LOCALE, namespace: 'SiteRequest' }),
      getTranslations({ locale: LOCALE, namespace: 'Cloud' }),
      getTranslations({ locale: LOCALE, namespace: 'WebsiteCheck' }),
      getTranslations({ locale: LOCALE, namespace: 'Work' }),
      getTranslations({ locale: LOCALE, namespace: 'Blog' }),
      getTranslations({ locale: LOCALE, namespace: 'About' }),
      getTranslations({ locale: LOCALE, namespace: 'Contact' }),
    ]);
  const [caseStudies, posts] = await Promise.all([
    published(() => listPortfolio({ locale: LOCALE, pageSize: LLMS_LIST_SIZE })),
    published(() => listPosts({ locale: LOCALE, pageSize: LLMS_LIST_SIZE })),
  ]);
  const security = securityPage(LOCALE);

  const text = buildLlmsTxt({
    siteUrl: env.SITE_URL,
    locale: LOCALE,
    name: SITE_NAME,
    tagline: TAGLINE,
    summary: firstSentence(meta('description')),
    email: CONTACT_EMAIL,
    pages: {
      services: page(services),
      // Its metaTitle carries the price, which the file leaves out.
      basicWebsite: { title: basic('footerLink'), note: basic('metaDescription') },
      basicWebsiteRequest: page(request),
      cloud: { ...page(cloud), url: webappUrl('cloud', LOCALE) },
      websiteCheck: page(check),
      work: page(work),
      blog: page(blog),
      about: page(about),
      contact: page(contact),
      security: { title: security.title, note: security.description },
    },
    services: SERVICES.map(({ key }) => ({
      slug: SERVICE_SLUGS[key],
      title: home(`services.items.${key}.title`),
      note: home(`services.items.${key}.body`),
    })),
    caseStudies,
    posts,
    legal: legalOwner
      ? {
          legal: toPage(legalDocument('legal', legalOwner, LOCALE)),
          privacy: toPage(legalDocument('privacy', legalOwner, LOCALE)),
        }
      : null,
  });

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': `public, max-age=${PUBLIC_REVALIDATE}`,
    },
  });
}

/** A page from its namespace's metaTitle and metaDescription. */
function page(t: (key: 'metaTitle' | 'metaDescription') => string) {
  return { title: t('metaTitle'), note: t('metaDescription') };
}

function toPage({ title, description }: { title: string; description: string }) {
  return { title, note: description };
}
