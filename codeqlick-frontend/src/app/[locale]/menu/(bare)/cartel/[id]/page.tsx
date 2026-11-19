import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PrintButton } from '@/components/app/PrintButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { fetchMenuQr, getMenu, listMenus } from '@/lib/api/menus';
import { menuLocale, shortLink } from '@/lib/menu';
import { webappOrigin } from '@/lib/webapp-seo';
import styles from '../../bare.module.css';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export const metadata: Metadata = { robots: { index: false } };

/**
 * The A5 poster of a menu (architecture 4.20): "Scan to see the menu", the business, the QR at
 * 90 mm, the short link as text and, on a free menu, "Made with Codeqlick". Printed or saved as
 * PDF from the browser. `?lang=en|es` picks its words (the menu's language by default).
 */
export default async function MenuPosterPage({ params, searchParams }: PageProps) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const menu = await getMenu(id).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const asked = (await searchParams).lang;
  const lang = asked === 'en' || asked === 'es' ? asked : menuLocale(menu.language);
  const [qr, listed] = await Promise.all([
    fetchMenuQr(id).catch(() => null),
    listMenus().catch(() => null),
  ]);
  if (!qr) notFound();
  const t = await getTranslations({ locale: lang, namespace: 'Menu.poster' });
  const tui = await getTranslations({ locale, namespace: 'Menu.poster' });
  const link = shortLink(webappOrigin('menu'), menu.slug).replace(/^https?:\/\//, '');
  const showBadge = listed?.limits.showBadge ?? true;
  const other = lang === 'en' ? 'es' : 'en';

  return (
    <main className={styles.page}>
      <div className={styles.sheetWrap}>
        <div className={styles.toolbar}>
          <h1>{tui('title')}</h1>
          <div>
            <Link href={`/menu/editar/${menu.id}`}>{tui('back')}</Link>
            {' · '}
            <Link href={`/menu/cartel/${menu.id}?lang=${other}`} lang={other}>
              {tui(`switch.${other}`)}
            </Link>
          </div>
          <PrintButton label={tui('print')} />
        </div>
        <article className={styles.sheet} lang={lang} aria-label={tui('title')}>
          <p className={styles.kicker}>
            {menu.kind === 'CATALOGUE' ? t('scanCatalogue') : t('scanMenu')}
          </p>
          <p className={styles.business}>{menu.businessName}</p>
          {/* The QR is drawn by the API (our own SVG): a title for assistive technology inside. */}
          <div className={styles.qr} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className={styles.shortLink}>{link}</p>
          {showBadge ? <p className={styles.made}>{t('madeWith')}</p> : null}
        </article>
      </div>
    </main>
  );
}
