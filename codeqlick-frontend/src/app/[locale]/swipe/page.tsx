import { PageHeader } from '@/components/ui/PageHeader';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { AdZone } from '@/components/videochat/AdZone';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCurrentUser } from '@/lib/auth/session';
import adult from '@/components/adult/adult.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** swipe.codeqlick.com: what it is, the adult-content warning, and the way in. */
export default async function SwipeLandingPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe.landing' });
  const user = await getCurrentUser();
  const deck = `/${locale}/swipe/deck`;

  return (
    <div className={adult.landing}>
      <section>
        <PageHeader
          variant="hero"
          eyebrow={t('eyebrow')}
          title={t('title')}
          lead={t('lead')}
          actions={
            <>
              {user ? (
                <Button href="/swipe/deck">{t('enter')}</Button>
              ) : (
                <>
                  <Button href={`/login?next=${encodeURIComponent(deck)}`}>{t('signIn')}</Button>
                  <Button href="/register" variant="outline">
                    {t('createAccount')}
                  </Button>
                </>
              )}
              <a className={adult.leaveLink} href="https://www.google.com" rel="noreferrer">
                {t('leave')}
              </a>
            </>
          }
        >
          <div className={adult.warning} role="note">
            <strong>{t('warningTitle')}.</strong> {t('warning')}
          </div>
        </PageHeader>
      </section>

      <section className={adult.columns}>
        <div>
          <h2 className={adult.sectionTitle}>{t('howTitle')}</h2>
          <ol className={adult.steps}>
            {(['1', '2', '3'] as const).map((n) => (
              <li key={n}>
                <strong>{t(`how${n}Title`)}</strong>
                <span>{t(`how${n}`)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className={adult.sectionTitle}>{t('safetyTitle')}</h2>
          <ul className={adult.safety}>
            {(['1', '2', '3', '4'] as const).map((n) => (
              <li key={n}>{t(`safety${n}`)}</li>
            ))}
          </ul>
          <p>
            <Link href="/swipe/takedown" className={adult.inlineLink}>
              {t('takedownLink')}
            </Link>
          </p>
        </div>
      </section>
      <AdZone app="swipe" zone="pages" />
    </div>
  );
}
