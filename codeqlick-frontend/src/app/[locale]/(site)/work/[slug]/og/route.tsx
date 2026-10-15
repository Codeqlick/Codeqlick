import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getPortfolioItem } from '@/lib/api/portfolio';
import { env } from '@/lib/env';
import { renderOgImage } from '@/lib/og-image';

/** Social preview image of a case study, for those without a cover (see generateMetadata). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  let item;
  try {
    item = await getPortfolioItem(slug, locale);
  } catch (error) {
    if (isNotFound(error)) return new Response(null, { status: 404 });
    throw error;
  }
  const t = await getTranslations({ locale, namespace: 'Work' });
  return renderOgImage({
    eyebrow: item.clientName ? t('ogEyebrowClient', { client: item.clientName }) : t('ogEyebrow'),
    title: item.title,
    host: new URL(env.SITE_URL).host,
  });
}
