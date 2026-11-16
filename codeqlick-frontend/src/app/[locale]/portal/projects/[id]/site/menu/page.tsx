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
  // The English version's menu (decision 106) gets its own QR and poster.
  const englishUrl = site.english ? `${site.url}/en/carta` : null;
  const qrOf = (url: string) =>
    QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#14101F', light: '#FFFFFF' },
    });
  const [qr, englishQr] = await Promise.all([
    qrOf(menuUrl),
    englishUrl ? qrOf(englishUrl) : Promise.resolve(null),
  ]);
  const address = site.editable.contact.address;
  const posterStyle = {
    '--poster-primary': site.colors.primary,
    '--poster-on-primary': site.colors.primaryText,
  } as React.CSSProperties;
  const poster = (
    url: string,
    code: string,
    words: { kicker: string; headline: string; hint: string },
  ) => (
    <article className={kit.poster} aria-label={t('posterTitle')} style={posterStyle}>
      <header className={kit.band}>
        <p className={kit.kicker}>{words.kicker}</p>
        <p className={kit.headline}>{words.headline}</p>
      </header>
      <div className={kit.body}>
        <p className={kit.business}>{site.businessName}</p>
        <div className={kit.qr} dangerouslySetInnerHTML={{ __html: code }} />
        <p className={kit.thanks}>{words.hint}</p>
        <p className={kit.address}>
          {url.replace(/^https?:\/\//, '')}
          {address ? (
            <>
              <br />
              {address.street}, {address.city}
            </>
          ) : null}
        </p>
      </div>
    </article>
  );

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

      {poster(menuUrl, qr, {
        kicker: t('posterKicker'),
        headline: t('posterHeadline'),
        hint: t('posterHint'),
      })}

      {englishUrl && englishQr ? (
        <>
          <section className={styles.panel} data-print="hide">
            <h2 className={styles.panelTitle}>{t('english.title')}</h2>
            <p className={styles.muted}>{t('english.lead')}</p>
            <CopyLink url={englishUrl} labels={{ copy: t('copy'), copied: t('copied') }} />
          </section>
          {poster(englishUrl, englishQr, {
            kicker: t('english.posterKicker'),
            headline: t('english.poster'),
            hint: t('english.posterHint'),
          })}
        </>
      ) : null}
    </div>
  );
}
