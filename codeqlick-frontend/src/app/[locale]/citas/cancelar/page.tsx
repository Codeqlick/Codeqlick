import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { previewCitasCancel } from '@/lib/api/citas';
import styles from '../citas.module.css';
import { CancelForm } from './CancelForm';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export const metadata: Metadata = { robots: { index: false } };

/** From the link in the confirmation email: shows the appointment and lets the person cancel it. */
export default async function CitasCancelPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const token = (await searchParams).token ?? '';
  const t = await getTranslations({ locale, namespace: 'Citas.cancel' });
  const appointment = token ? await previewCitasCancel(token) : null;
  const tag = locale === 'es' ? 'es-ES' : 'en-GB';

  if (!appointment) {
    return (
      <div className={styles.notFound}>
        <h1 className={styles.heroTitle}>{t('title')}</h1>
        <Alert tone="error">{t('notFound')}</Alert>
      </div>
    );
  }

  const when = new Intl.DateTimeFormat(tag, {
    timeZone: appointment.timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(appointment.startsAt));
  const past = new Date(appointment.startsAt).getTime() <= Date.now();
  const bookAgain = (
    <div>
      <Button href={`/citas/${appointment.slug}`} variant="outline">
        {t('bookAgain')}
      </Button>
    </div>
  );

  return (
    <div className={styles.public}>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>{appointment.ownerName}</p>
        <h1 className={styles.heroTitle}>{appointment.title}</h1>
        <ul className={styles.facts}>
          <li>{when}</li>
          {appointment.location ? <li>{appointment.location}</li> : null}
        </ul>
      </section>
      {appointment.status === 'CANCELLED' ? (
        <>
          <Alert tone="info">{t('already')}</Alert>
          {bookAgain}
        </>
      ) : past ? (
        <Alert tone="info">{t('past')}</Alert>
      ) : (
        <>
          <p className={styles.muted}>{t('lead', { name: appointment.ownerName })}</p>
          <CancelForm
            token={token}
            locale={locale}
            labels={{ button: t('button'), cancelling: t('cancelling') }}
          />
        </>
      )}
    </div>
  );
}
