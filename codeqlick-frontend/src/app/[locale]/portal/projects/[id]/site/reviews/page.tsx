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
import kit from './reviews.module.css';

/**
 * The Google review kit (architecture 8.2): the QR code of the business's review link, the link to
 * share and a poster to print or save as PDF.
 */
export default async function ReviewKitPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'ReviewKit' });
  const site = await getMySite(id).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const reviewUrl = site.editable.contact.reviewUrl;
  const back = { href: `/portal/projects/${id}/site`, label: t('back') };

  if (!reviewUrl) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t('title')} lead={t('lead')} back={back} />
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('howTitle')}</h2>
          <ol className={kit.steps}>
            <li>
              {t.rich('how1', {
                link: (chunks) => (
                  <a href="https://business.google.com" target="_blank" rel="noopener noreferrer">
                    {chunks}
                  </a>
                ),
              })}
            </li>
            <li>{t('how2')}</li>
            <li>{t('how3')}</li>
          </ol>
          <p className={styles.muted}>{t('noProfile')}</p>
          <div className={styles.actions}>
            <Button href={`/portal/projects/${id}/site#reviewUrl`} size="sm">
              {t('addLink')}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const qr = await QRCode.toString(reviewUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#14101F', light: '#FFFFFF' },
  });
  const share = t('shareText', { business: site.businessName, url: reviewUrl });

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
        <h2 className={styles.panelTitle}>{t('shareTitle')}</h2>
        <p className={styles.muted}>{t('shareBody')}</p>
        <CopyLink url={reviewUrl} labels={{ copy: t('copy'), copied: t('copied') }} />
        <div className={styles.actions}>
          <Button
            href={`https://wa.me/?text=${encodeURIComponent(share)}`}
            variant="outline"
            size="sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('whatsapp')}
          </Button>
          <Button
            href={`mailto:?subject=${encodeURIComponent(t('emailSubject', { business: site.businessName }))}&body=${encodeURIComponent(share)}`}
            variant="outline"
            size="sm"
          >
            {t('email')}
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
          <p className={kit.stars} aria-hidden="true">
            ★★★★★
          </p>
          <ol className={kit.posterSteps}>
            <li>{t('posterStep1')}</li>
            <li>{t('posterStep2')}</li>
            <li>{t('posterStep3')}</li>
          </ol>
          <p className={kit.thanks}>{t('posterThanks')}</p>
        </div>
      </article>
    </div>
  );
}
