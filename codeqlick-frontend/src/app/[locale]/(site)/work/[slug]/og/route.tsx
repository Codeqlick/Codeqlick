import { permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { getPortfolioItem, getPortfolioRedirect } from '@/lib/api/portfolio';
import { env } from '@/lib/env';
import { renderOgImage } from '@/lib/og-image';
import { contentPath, lookUpSlug } from '@/lib/slug-redirect';

/** Social preview image of a case study, for those without a cover (see generateMetadata). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const found = await lookUpSlug(
    slug,
    (current) => getPortfolioItem(current, locale),
    getPortfolioRedirect,
  );
  // An old slug: the image of the item's current address (decision 71).
  if (found.status === 'moved') permanentRedirect(`${contentPath(locale, 'work', found.slug)}/og`);
  if (found.status === 'missing') return new Response(null, { status: 404 });
  const item = found.item;
  const t = await getTranslations({ locale, namespace: 'Work' });
  return renderOgImage({
    eyebrow: item.clientName ? t('ogEyebrowClient', { client: item.clientName }) : t('ogEyebrow'),
    title: item.title,
    host: new URL(env.SITE_URL).host,
  });
}
