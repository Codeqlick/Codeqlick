import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CopyLink } from '@/components/app/CopyLink';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMenu, listMenus } from '@/lib/api/menus';
import { shortLink } from '@/lib/menu';
import { webappOrigin } from '@/lib/webapp-seo';
import { deleteMenuAction } from '../../../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../menu.module.css';
import { MenuEditor } from './MenuEditor';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string }>;
};

export const metadata: Metadata = { robots: { index: false } };

/** Creates (`nueva`) or edits one of the signed-in person's menus. */
export default async function MenuEditorPage({ params, searchParams }: PageProps) {
  const { locale: raw, id } = await params;
  const created = (await searchParams).created === '1';
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'Menu.editor' });
  const isNew = id === 'nueva';
  const { items, limits } = await listMenus();
  const menu = isNew
    ? null
    : await getMenu(id).catch((error: unknown) => {
        if (isNotFound(error)) notFound();
        throw error;
      });
  const origin = webappOrigin('menu');
  const back = { href: '/menu', label: t('back') };

  // The free plan's single menu: say so instead of letting the form fail at the end.
  if (isNew && items.length >= limits.menus) {
    return (
      <div className={styles.stack}>
        <PageHeader back={back} title={t('newTitle')} />
        <Alert tone="info">{t('limit')}</Alert>
        <div>
          <Button href="/menu">{t('back')}</Button>
        </div>
      </div>
    );
  }

  const link = menu ? shortLink(origin, menu.slug) : '';

  return (
    <div className={styles.stack}>
      <PageHeader
        back={back}
        title={isNew ? t('newTitle') : t('editTitle')}
        actions={
          menu ? (
            <>
              <Button href={`/menu/disponibilidad/${menu.id}`} variant="outline" size="sm">
                {t('availability')}
              </Button>
              <Button
                href={link}
                external
                variant="outline"
                size="sm"
                target="_blank"
                rel="noopener"
              >
                {t('view')}
              </Button>
            </>
          ) : undefined
        }
      />
      {created ? <Alert tone="success">{t('createdNotice')}</Alert> : null}
      {menu?.suspended ? (
        <Alert tone="error">{t('suspendedBanner', { reason: menu.suspendedReason ?? '' })}</Alert>
      ) : null}

      <MenuEditor locale={locale} menu={menu} limits={limits} origin={origin} badgeHref={origin} />

      {menu ? (
        <>
          <section className={`${appUi.card}`} aria-labelledby="qr-title">
            <h2 id="qr-title" className={appUi.cardTitle}>
              {t('qrTitle')}
            </h2>
            <p className={styles.muted}>{t('qrBody')}</p>
            <div className={styles.qrRow}>
              {/* The owner's QR, drawn by the API and proxied by the route below. */}
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                src={`/${locale}/menu/qr/${menu.id}`}
                alt={t('qrAlt', { url: link })}
                width={160}
                height={160}
                className={styles.qr}
              />
              <div className={styles.qrActions}>
                <CopyLink url={link} labels={{ copy: t('copy'), copied: t('copied') }} />
                <div className={appUi.actions}>
                  <Button
                    href={`/${locale}/menu/qr/${menu.id}?download=1`}
                    external
                    variant="outline"
                    size="sm"
                  >
                    {t('downloadQr')}
                  </Button>
                  <Button href={`/menu/cartel/${menu.id}`} size="sm">
                    {t('posterLink')}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className={`${appUi.card} ${styles.danger}`} aria-labelledby="delete-title">
            <h2 id="delete-title" className={appUi.cardTitle}>
              {t('deleteTitle')}
            </h2>
            <p className={styles.muted}>{t('deleteBody')}</p>
            <details className={styles.confirm}>
              <summary>{t('delete')}</summary>
              <form action={deleteMenuAction} className={styles.confirmForm}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={menu.id} />
                <input type="hidden" name="slug" value={menu.slug} />
                <p>{t('deleteConfirm', { name: menu.businessName })}</p>
                <SubmitButton variant="danger" pendingLabel={t('deleting')}>
                  {t('deleteYes')}
                </SubmitButton>
              </form>
            </details>
          </section>
        </>
      ) : null}
    </div>
  );
}
