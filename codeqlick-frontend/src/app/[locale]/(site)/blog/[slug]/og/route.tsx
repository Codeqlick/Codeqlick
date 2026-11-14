import { permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { getPost, getPostRedirect } from '@/lib/api/posts';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { renderOgImage } from '@/lib/og-image';
import { contentPath, lookUpSlug } from '@/lib/slug-redirect';

/** Social preview image of a post, for posts without a cover (see generateMetadata). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const found = await lookUpSlug(slug, (current) => getPost(current, locale), getPostRedirect);
  // An old slug: the image of the item's current address (decision 71).
  if (found.status === 'moved') permanentRedirect(`${contentPath(locale, 'blog', found.slug)}/og`);
  if (found.status === 'missing') return new Response(null, { status: 404 });
  const post = found.item;
  const t = await getTranslations({ locale, namespace: 'Blog' });
  return renderOgImage({
    eyebrow: t('ogEyebrow', { date: formatDate(post.publishedAt, locale) }),
    title: post.title,
    host: new URL(env.SITE_URL).host,
  });
}
