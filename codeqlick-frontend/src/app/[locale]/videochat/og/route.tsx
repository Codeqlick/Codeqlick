import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { renderOgImage } from '@/lib/og-image';
import { webappOrigin } from '@/lib/webapp-seo';

/** The video chat's share image (Open Graph, X): its name and promise on the brand background. */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Videochat' });
  return renderOgImage({
    eyebrow: t('ogEyebrow'),
    title: t('ogTitle'),
    host: new URL(webappOrigin('videochat')).host,
  });
}
