import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL } from '@/lib/site';
import home from '../page.module.css';

/** Closing call to action of the service pages, in the home page's fuchsia panel. */
export async function ContactCta({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Services' });
  return (
    <section className={home.ctaSection} aria-labelledby="cta-title">
      <div className={home.cta}>
        <div className={home.ctaText}>
          <h2 id="cta-title" className={home.ctaTitle}>
            {t('ctaTitle')}
          </h2>
          <p className={home.ctaBody}>{t('ctaBody')}</p>
        </div>
        <div className={home.ctaActions}>
          <Button href="/contact" variant="ink" block>
            {t('ctaButton')}
          </Button>
          <a href={`mailto:${CONTACT_EMAIL}`} className={home.ctaEmail}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </section>
  );
}
