import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MenuView } from '@/components/menu/MenuView';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getPublicMenu } from '@/lib/api/menus';
import { buildMenuLabels, menuLocale } from '@/lib/menu';
import { appPath } from '@/lib/webapp-request';
import { webappOrigin, webappUrl } from '@/lib/webapp-seo';
import styles from '../bare.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const result = await getPublicMenu(slug).catch(() => null);
  if (result?.status !== 'found') return { robots: { index: false, follow: false } };
  const { menu } = result;
  const t = await getTranslations({ locale, namespace: 'Menu.view' });
  return {
    title: { absolute: `${menu.businessName} · ${menu.title}` },
    description: menu.intro || menu.address || t('metaDescription', { name: menu.businessName }),
    // One address per menu: the page in the menu's own language, the one the short link goes to.
    alternates: { canonical: webappUrl('menu', menuLocale(menu.language), `/${menu.slug}`) },
    robots: menu.indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/**
 * A menu's public page (architecture 4.20): server-rendered, no JavaScript, no cookies, no
 * third-party anything. A renamed link goes on to the new one; a missing, paused or suspended
 * menu is one neutral 404.
 */
export default async function PublicMenuPage({ params }: PageProps) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const result = await getPublicMenu(slug);
  if (result.status === 'moved') {
    permanentRedirect(await appPath(`/${locale}/menu/${result.slug}`, locale));
  }
  if (result.status === 'missing') notFound();

  const t = await getTranslations({ locale, namespace: 'Menu' });
  const labels = buildMenuLabels((key) => t(key as never));

  return (
    <main className={styles.page}>
      <MenuView
        menu={result.menu}
        labels={labels}
        uiLocale={locale}
        badgeHref={webappOrigin('menu')}
        footer={
          <p className={styles.report}>
            <Link href={`/menu/reportar?menu=${encodeURIComponent(result.menu.slug)}`}>
              {t('view.report')}
            </Link>
          </p>
        }
      />
    </main>
  );
}
