import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CopyLink } from '@/components/app/CopyLink';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { getMenu, listMenus } from '@/lib/api/menus';
import { getCurrentUser } from '@/lib/auth/session';
import { shortLink, type MenuLimits, type MenuSummary } from '@/lib/menu';
import { webappAlternates, webappOrigin } from '@/lib/webapp-seo';
import { deleteMenuAction, toggleMenuAction } from '../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from './menu.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  // The home is the one page of the app that search engines list, with both languages.
  return { alternates: webappAlternates('menu', locale), robots: { index: true, follow: true } };
}

/** menu.codeqlick.com: what it is and, signed in, the person's menu with its QR and poster. */
export default async function MenuLandingPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Menu' });
  const user = await getCurrentUser();
  let menus: MenuSummary[] | null = null;
  let limits: MenuLimits | null = null;
  if (user) {
    const listed = await listMenus().catch(() => null);
    menus = listed?.items ?? null;
    limits = listed?.limits ?? null;
  }
  const origin = webappOrigin('menu');
  // The reason of a suspension is only on the full menu.
  const reasons = new Map<string, string>();
  await Promise.all(
    (menus ?? [])
      .filter((menu) => menu.suspended)
      .map(async (menu) => {
        const full = await getMenu(menu.id).catch(() => null);
        if (full?.suspendedReason) reasons.set(menu.id, full.suspendedReason);
      }),
  );

  const features = (
    <ul className={styles.features}>
      {(['1', '2', '3', '4'] as const).map((n) => (
        <li key={n}>
          <strong>{t(`landing.feature${n}Title`)}</strong>
          <span>{t(`landing.feature${n}`)}</span>
        </li>
      ))}
    </ul>
  );
  const canCreate = limits ? (menus?.length ?? 0) < limits.menus : true;

  return (
    <div className={styles.landing}>
      {user ? (
        <section>
          <PageHeader
            eyebrow={t('landing.eyebrow')}
            title={t('landing.title')}
            lead={t('landing.lead')}
            actions={
              menus && menus.length > 0 && canCreate ? (
                <Button href="/menu/editar/nueva">{t('landing.newMenu')}</Button>
              ) : undefined
            }
          />
          <details className={appUi.more}>
            <summary>{t('landing.featuresTitle')}</summary>
            {features}
          </details>
        </section>
      ) : (
        <section className={appUi.split}>
          <PageHeader
            variant="hero"
            eyebrow={t('landing.eyebrow')}
            title={t('landing.title')}
            lead={t('landing.lead')}
            actions={
              <>
                <Button href="/register">{t('landing.createAccount')}</Button>
                <Button href="/login?next=/menu" variant="outline">
                  {t('signIn')}
                </Button>
              </>
            }
          />
          <div className={appUi.card}>{features}</div>
        </section>
      )}

      {user ? (
        <section aria-labelledby="menus-title">
          <h2 id="menus-title" className={appUi.sectionTitle}>
            {t('menus.title')}
          </h2>
          {menus === null ? (
            <p className={styles.muted}>{t('menus.loadError')}</p>
          ) : menus.length === 0 ? (
            <EmptyState
              headingLevel={3}
              title={t('menus.empty')}
              action={<Button href="/menu/editar/nueva">{t('landing.newMenu')}</Button>}
            />
          ) : (
            <ul className={styles.menus}>
              {menus.map((menu) => {
                const link = shortLink(origin, menu.slug);
                return (
                  <li key={menu.id} className={styles.menuCard}>
                    <div className={styles.menuHead}>
                      <p className={styles.menuTitle}>{menu.businessName}</p>
                      <span
                        className={
                          menu.enabled && !menu.suspended
                            ? styles.tag
                            : `${styles.tag} ${styles.paused}`
                        }
                      >
                        {menu.suspended
                          ? t('menus.suspended')
                          : menu.enabled
                            ? t(`menus.kind.${menu.kind}`)
                            : t('menus.paused')}
                      </span>
                    </div>
                    {menu.suspended ? (
                      <Alert tone="error">
                        {t('menus.suspendedBanner', { reason: reasons.get(menu.id) ?? '' })}
                      </Alert>
                    ) : null}
                    <CopyLink
                      url={link}
                      labels={{ copy: t('menus.copy'), copied: t('menus.copied') }}
                    />
                    <div className={styles.qrRow}>
                      {/* oxlint-disable-next-line nextjs/no-img-element */}
                      <img
                        src={`/${locale}/menu/qr/${menu.id}`}
                        alt={t('menus.qrAlt', { url: link })}
                        width={120}
                        height={120}
                        className={styles.qr}
                      />
                      <div className={appUi.actions}>
                        <Button
                          href={`/${locale}/menu/qr/${menu.id}?download=1`}
                          external
                          variant="outline"
                          size="sm"
                        >
                          {t('menus.downloadQr')}
                        </Button>
                        <Button href={`/menu/cartel/${menu.id}`} variant="outline" size="sm">
                          {t('menus.poster')}
                        </Button>
                      </div>
                    </div>
                    <div className={appUi.actions}>
                      <Button href={link} external size="sm" target="_blank" rel="noopener">
                        {t('menus.view')}
                      </Button>
                      <Button href={`/menu/editar/${menu.id}`} size="sm" variant="outline">
                        {t('menus.edit')}
                      </Button>
                      <Button href={`/menu/disponibilidad/${menu.id}`} size="sm" variant="outline">
                        {t('menus.availability')}
                      </Button>
                      {menu.suspended ? null : (
                        <form action={toggleMenuAction} className={styles.inline}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="id" value={menu.id} />
                          <input type="hidden" name="enabled" value={menu.enabled ? 'off' : 'on'} />
                          <SubmitButton variant="outline" size="sm">
                            {menu.enabled ? t('menus.pause') : t('menus.resume')}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                    <details className={styles.confirm}>
                      <summary>
                        {t('menus.delete')}
                        <span className="visually-hidden"> — {menu.businessName}</span>
                      </summary>
                      <form action={deleteMenuAction} className={styles.confirmForm}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={menu.id} />
                        <input type="hidden" name="slug" value={menu.slug} />
                        <p>{t('menus.deleteConfirm', { name: menu.businessName })}</p>
                        <SubmitButton variant="danger" pendingLabel={t('menus.deleting')}>
                          {t('menus.deleteYes')}
                        </SubmitButton>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
