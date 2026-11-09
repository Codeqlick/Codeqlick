import { Avatar } from '@/components/ui/Avatar';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getPublicCitasPage } from '@/lib/api/citas';
import styles from '../citas.module.css';
import { BookingForm } from './BookingForm';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const page = await getPublicCitasPage(slug).catch(() => null);
  const t = await getTranslations({ locale, namespace: 'Citas' });
  if (!page)
    return { title: { absolute: `${t('notFound.title')} — Citas` }, robots: { index: false } };
  return {
    title: { absolute: `${page.title} · ${page.ownerName} — Citas` },
    description: page.description || t('public.with', { name: page.ownerName }),
    // A person's page: shared by link, not something to list in search engines.
    robots: { index: false },
  };
}

/** A public booking page: what it is, the free times, and the form. */
export default async function CitasPublicPage({ params }: PageProps) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'Citas' });
  const page = await getPublicCitasPage(slug);

  if (!page) {
    return (
      <div className={styles.notFound}>
        <h1 className={styles.heroTitle}>{t('notFound.title')}</h1>
        <p className={styles.muted}>{t('notFound.body')}</p>
        <div>
          <Button href="/citas">{t('notFound.back')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.public}>
      <section className={styles.intro}>
        <p className={`${styles.eyebrow} ${styles.owner}`}>
          <Avatar file={page.ownerAvatar} name={page.ownerName} size="sm" />
          {t('public.with', { name: page.ownerName })}
        </p>
        <h1 className={styles.heroTitle}>{page.title}</h1>
        <ul className={styles.facts}>
          <li>{t('public.minutes', { count: page.durationMinutes })}</li>
          {page.location ? <li>{page.location}</li> : null}
          {page.video ? <li>{t('public.videoCall')}</li> : null}
        </ul>
        {page.description ? <p className={styles.description}>{page.description}</p> : null}
      </section>

      {page.enabled ? (
        <BookingForm
          slug={page.slug}
          slots={page.slots}
          timeZone={page.timeZone}
          askPhone={page.askPhone}
          // eslint-disable-next-line react-hooks/purity -- rendered per request: when the form was shown.
          renderedAt={Date.now()}
        />
      ) : (
        <Alert tone="info">{t('public.paused')}</Alert>
      )}

      <footer className={styles.footer}>
        <span>{t('public.poweredBy')}</span>
        <Link href="/citas" className={styles.link}>
          {t('public.ownYour')}
        </Link>
      </footer>
    </div>
  );
}
