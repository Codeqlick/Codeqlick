import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getPreviewStatus } from '@/lib/api/site-requests';
import { firstParam } from '@/lib/format';
import home from '../../../../../page.module.css';
import styles from '../../../request.module.css';
import { buyWebsite } from './actions';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const INCLUDES = ['site', 'editor', 'hosting', 'extras', 'domain'] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  return { title: t('buyMetaTitle'), robots: { index: false, follow: false } };
}

/** Buying a preview's website (architecture 8.2, decision 20): what it includes, the terms, pay. */
export default async function BuyPage({ params, searchParams }: PageProps) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  const preview = /^[a-z0-9-]{1,40}$/.test(slug) ? await getPreviewStatus(slug) : null;
  if (!preview?.purchase) notFound();
  const { purchase } = preview;
  const euros = (cents: number) =>
    new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  const price = euros(purchase.priceCents);
  const total = euros(purchase.totalCents);
  const cancelled = firstParam((await searchParams).cancelled) === '1';
  const business = preview.business ?? '';

  return (
    <section className={`wrap ${styles.page}`}>
      <div className={home.intro}>
        <p className="eyebrow">{t('buyEyebrow')}</p>
        <h1 className={home.title}>{t('buyTitle', { business })}</h1>
        <p className={home.lead}>{t('buyLead')}</p>
      </div>

      <div className={styles.buy}>
        <div className={styles.buyCard}>
          <p className={styles.price}>
            {t('buyPrice', { price })}{' '}
            {purchase.vatPercent > 0 ? <span>{t('buyPriceNote')}</span> : null}
          </p>
          <p className={styles.hint}>{t('buyTotal', { total, vat: purchase.vatPercent })}</p>
          <h2 className={styles.legend}>{t('buyIncludesTitle')}</h2>
          <ul className={styles.includes}>
            {INCLUDES.map((key) => (
              <li key={key}>{t(`buyIncludes.${key}`)}</li>
            ))}
          </ul>
          <p>
            <a href={preview.url} target="_blank" rel="noopener noreferrer">
              {t('buyPreview')}
            </a>
          </p>
        </div>

        <div className={styles.buyCard}>
          {cancelled ? <Alert tone="info">{t('buyCancelled')}</Alert> : null}
          {purchase.available ? (
            <ActionForm action={buyWebsite} className={styles.form}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="slug" value={slug} />
              <FormCheckbox
                name="accept"
                required
                label={t.rich('buyAccept', {
                  terms: (chunks) => (
                    <Link href="/terms" target="_blank">
                      {chunks}
                    </Link>
                  ),
                })}
              />
              <SubmitButton>{t('buyButton', { price: total })}</SubmitButton>
              <p className={styles.hint}>{t('buySecure')}</p>
            </ActionForm>
          ) : (
            <>
              <Alert tone="info">
                {preview.status === 'BUILDING' ? t('buyNotReady') : t('buyTaken')}
              </Alert>
              <p>
                <Button href="/basic-website" variant="outline">
                  {t('back')}
                </Button>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
