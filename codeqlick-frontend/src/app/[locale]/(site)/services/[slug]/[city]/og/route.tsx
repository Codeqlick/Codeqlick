import { getTranslations } from 'next-intl/server';
import { cityBySlug, localPageTitle, localServiceBySlug } from '@/content/local-seo';
import { resolveLocale } from '@/i18n/locale';
import { env } from '@/lib/env';
import { renderOgImage } from '@/lib/og-image';

/** Social preview image of a local service page (decision 121). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string; city: string }> },
) {
  const { locale: rawLocale, slug, city: citySlug } = await params;
  const locale = resolveLocale(rawLocale);
  const service = localServiceBySlug(slug);
  const city = cityBySlug(citySlug);
  if (!service || !city) return new Response(null, { status: 404 });
  const t = await getTranslations({ locale, namespace: 'LocalSeo' });
  return renderOgImage({
    eyebrow: t('ogEyebrow', { city: city.name[locale] }),
    title: localPageTitle(locale, service, city),
    host: new URL(env.SITE_URL).host,
  });
}
