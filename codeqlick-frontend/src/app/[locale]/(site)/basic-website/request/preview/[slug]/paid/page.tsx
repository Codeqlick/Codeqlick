import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { getPurchase } from '@/lib/api/site-requests';
import { firstParam } from '@/lib/format';
import home from '../../../../../page.module.css';
import styles from '../../../request.module.css';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  return { title: t('paidMetaTitle'), robots: { index: false, follow: false } };
}

/**
 * Where Stripe returns after paying (architecture 8.2): follows the purchase until Stripe's webhook
 * has made the website.
 */
export default async function PaidPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  const session = firstParam((await searchParams).session) ?? '';
  const purchase = /^cs_[A-Za-z0-9_]{1,250}$/.test(session) ? await getPurchase(session) : null;

  let title = t('paidMetaTitle');
  let body = t('paidUnknown');
  let refresh = false;
  if (purchase?.status === 'PAID' && purchase.siteUrl) {
    title = t('paidTitle');
    body = t('paidBody', { business: purchase.business ?? '' });
  } else if (purchase?.status === 'PAID') {
    title = t('paidWaitTitle');
    body = purchase.delayed ? t('paidSlow') : t('paidWaitBody');
    refresh = !purchase.delayed;
  } else if (purchase?.status === 'PENDING') {
    body = t('paidPending');
    refresh = true;
  } else if (purchase?.status === 'EXPIRED') {
    body = t('paidExpired');
  }

  return (
    <section className={`wrap ${styles.page}`}>
      <div className={home.intro}>
        <p className="eyebrow">{t('buyEyebrow')}</p>
        <h1 className={home.title}>{title}</h1>
        <p className={home.lead}>{body}</p>
        {refresh ? <AutoRefresh seconds={5} /> : null}
        {purchase?.siteUrl ? (
          <p>
            <Button href={purchase.siteUrl}>{t('paidOpen')}</Button>
          </p>
        ) : null}
      </div>
    </section>
  );
}
