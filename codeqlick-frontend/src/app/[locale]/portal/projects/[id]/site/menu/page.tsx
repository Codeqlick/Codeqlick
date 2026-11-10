import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import QRCode from 'qrcode';
import styles from '@/components/app/app.module.css';
import { CopyLink } from '@/components/app/CopyLink';
import { PageHeader } from '@/components/app/PageHeader';
import { PrintButton } from '@/components/app/PrintButton';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMySite } from '@/lib/api/portal-site';
import kit from '../reviews/reviews.module.css';

/**
 * The menu's QR (architecture 8.2, menu extra): the code of `<site>/carta`, the link to share and
 * an A5 poster for the tables or the shop window, printed or saved as PDF.
 */
export default async function MenuKitPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'MenuKit' });
  const site = await getMySite(id).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const back = { href: `/portal/projects/${id}/site`, label: t('back') };

  if (!site.menu.published) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t('title')} lead={t('lead')} back={back} />
        <section className={styles.panel}>
          <p className={styles.muted}>{site.menu.enabled ? t('notYet') : t('notEnabled')}</p>
          <div className={styles.actions}>
            <Button href={`/portal/projects/${id}/site/editor`} size="sm">
              {t('openEditor')}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const menuUrl = `${site.url}/carta`;
  const qr = await QRCode.toString(menuUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#14101F', light: '#FFFFFF' },
  });
  const address = site.editable.contact.address;

  return (
    <div className={styles.stack}>
      <div data-print="hide">
        <PageHeader
          title={t('title')}
          lead={t('lead')}
          back={back}
          actions={<PrintButton label={t('print')} />}
        />
      </div>

      <section className={styles.panel} data-print="hide">
        <h2 className={styles.panelTitle}>{t('linkTitle')}</h2>
        <p className={styles.muted}>{t('linkBody')}</p>
        <CopyLink url={menuUrl} labels={{ copy: t('copy'), copied: t('copied') }} />
        <div className={styles.actions}>
          <Button href={menuUrl} variant="outline" size="sm" target="_blank" rel="noopener">
            {t('view')}
          </Button>
        </div>
      </section>

      <section className={styles.panel} data-print="hide">
        <h2 className={styles.panelTitle}>{t('posterTitle')}</h2>
        <p className={styles.muted}>{t('posterBody')}</p>
      </section>

      <article
        className={kit.poster}
        aria-label={t('posterTitle')}
        style={
          {
            '--poster-primary': site.colors.primary,
            '--poster-on-primary': site.colors.primaryText,
          } as React.CSSProperties
        }
      >
        <header className={kit.band}>
          <p className={kit.kicker}>{t('posterKicker')}</p>
          <p className={kit.headline}>{t('posterHeadline')}</p>
        </header>
        <div className={kit.body}>
          <p className={kit.business}>{site.businessName}</p>
          <div className={kit.qr} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className={kit.thanks}>{t('posterHint')}</p>
          <p className={kit.address}>
            {menuUrl.replace(/^https?:\/\//, '')}
            {address ? (
              <>
                <br />
                {address.street}, {address.city}
              </>
            ) : null}
          </p>
        </div>
      </article>
    </div>
  );
}
