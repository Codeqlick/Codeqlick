import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getPost } from '@/lib/api/posts';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { renderOgImage } from '@/lib/og-image';

/** Social preview image of a post, for posts without a cover (see generateMetadata). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  let post;
  try {
    post = await getPost(slug, locale);
  } catch (error) {
    if (isNotFound(error)) return new Response(null, { status: 404 });
    throw error;
  }
  const t = await getTranslations({ locale, namespace: 'Blog' });
  return renderOgImage({
    eyebrow: t('ogEyebrow', { date: formatDate(post.publishedAt, locale) }),
    title: post.title,
    host: new URL(env.SITE_URL).host,
  });
}
