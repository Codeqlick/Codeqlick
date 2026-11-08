import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { CopyLink } from '@/components/app/CopyLink';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  listCitasAppointments,
  listCitasPages,
  type CitasAppointment,
  type CitasPage,
} from '@/lib/api/citas';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { cancelAppointmentAction, deletePageAction, togglePageAction } from './actions';
import styles from './citas.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string }>;
};

/** This host's public origin (behind Nginx the request says http). */
async function publicOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get('host') ?? 'citas.codeqlick.com';
  const protocol = list.get('x-forwarded-proto') ?? (env.isProduction ? 'https' : 'http');
  return `${protocol}://${host}`;
}

/** citas.codeqlick.com: what it is, and for a signed-in person their pages and appointments. */
export default async function CitasLandingPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const scope = (await searchParams).scope === 'past' ? 'past' : 'upcoming';
  const t = await getTranslations({ locale, namespace: 'Citas' });
  const user = await getCurrentUser();
  let pages: CitasPage[] | null = null;
  let appointments: CitasAppointment[] | null = null;
  if (user) {
    [pages, appointments] = await Promise.all([
      listCitasPages().catch(() => null),
      listCitasAppointments(scope).catch(() => null),
    ]);
  }
  const origin = await publicOrigin();
  const tag = locale === 'es' ? 'es-ES' : 'en-GB';
  const when = (appointment: CitasAppointment) =>
    new Intl.DateTimeFormat(tag, {
      timeZone: appointment.timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(appointment.startsAt));

  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{t('landing.eyebrow')}</p>
          <h1 className={styles.heroTitle}>{t('landing.title')}</h1>
          <p className={styles.heroLead}>{t('landing.lead')}</p>
          <div className={styles.actions}>
            {user ? (
              <Button href="/citas/editar/nueva">{t('landing.newPage')}</Button>
            ) : (
              <>
                <Button href="/register">{t('landing.createAccount')}</Button>
                <Button href="/login?next=/citas" variant="outline">
                  {t('signIn')}
                </Button>
              </>
            )}
          </div>
        </div>
        <ul className={`${styles.card} ${styles.features}`}>
          {(['1', '2', '3', '4'] as const).map((n) => (
            <li key={n}>
              <strong>{t(`landing.feature${n}Title`)}</strong>
              <span>{t(`landing.feature${n}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      {user ? (
        <section aria-labelledby="pages-title">
          <h2 id="pages-title" className={styles.sectionTitle}>
            {t('pages.title')}
          </h2>
          {pages === null ? (
            <p className={styles.muted}>{t('pages.loadError')}</p>
          ) : pages.length === 0 ? (
            <p className={styles.muted}>{t('pages.empty')}</p>
          ) : (
            <ul className={styles.pages}>
              {pages.map((page) => (
                <li key={page.id} className={styles.page}>
                  <div className={styles.pageHead}>
                    <p className={styles.pageTitle}>{page.title}</p>
                    <span className={page.enabled ? styles.tag : `${styles.tag} ${styles.paused}`}>
                      {page.enabled
                        ? t('pages.minutes', { count: page.durationMinutes })
                        : t('pages.paused')}
                    </span>
                  </div>
                  <p className={styles.small}>
                    {t('pages.upcoming', { count: page.upcoming })}
                    {page.video ? ` · ${t('pages.video')}` : ''}
                  </p>
                  <CopyLink
                    url={`${origin}/${locale}/citas/${page.slug}`}
                    labels={{ copy: t('pages.copy'), copied: t('pages.copied') }}
                  />
                  <div className={styles.actions}>
                    <Button href={`/citas/${page.slug}`} size="sm">
                      {t('pages.view')}
                    </Button>
                    <Button href={`/citas/editar/${page.id}`} size="sm" variant="outline">
                      {t('pages.edit')}
                    </Button>
                    <form action={togglePageAction} className={styles.inline}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={page.id} />
                      <input type="hidden" name="enabled" value={page.enabled ? 'off' : 'on'} />
                      <SubmitButton variant="outline" size="sm">
                        {page.enabled ? t('pages.pause') : t('pages.resume')}
                      </SubmitButton>
                    </form>
                    <form action={deletePageAction} className={styles.inline}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={page.id} />
                      <SubmitButton variant="ghost" size="sm">
                        {t('pages.delete')}
                        <span className="visually-hidden"> — {page.title}</span>
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {user ? (
        <section aria-labelledby="appointments-title">
          <div className={styles.sectionHead}>
            <h2 id="appointments-title" className={styles.sectionTitle}>
              {scope === 'past' ? t('appointments.pastTitle') : t('appointments.title')}
            </h2>
            <Link href={scope === 'past' ? '/citas' : '/citas?scope=past'} className={styles.link}>
              {scope === 'past' ? t('appointments.showUpcoming') : t('appointments.showPast')}
            </Link>
          </div>
          {appointments === null ? (
            <p className={styles.muted}>{t('appointments.loadError')}</p>
          ) : appointments.length === 0 ? (
            <p className={styles.muted}>
              {scope === 'past' ? t('appointments.emptyPast') : t('appointments.empty')}
            </p>
          ) : (
            <ul className={styles.appointments}>
              {appointments.map((appointment) => (
                <li
                  key={appointment.id}
                  className={styles.appointment}
                  data-cancelled={appointment.status === 'CANCELLED' ? '' : undefined}
                >
                  <div>
                    <p className={styles.when}>{when(appointment)}</p>
                    <p className={styles.who}>
                      <strong>{appointment.name}</strong> · {appointment.page.title}
                    </p>
                    <p className={styles.small}>
                      <a href={`mailto:${appointment.email}`}>{appointment.email}</a>
                      {appointment.phone ? (
                        <>
                          {' · '}
                          {t('appointments.phone')}{' '}
                          <a href={`tel:${appointment.phone.replace(/[^\d+]/g, '')}`}>
                            {appointment.phone}
                          </a>
                        </>
                      ) : null}
                    </p>
                    {appointment.note ? (
                      <p className={styles.small}>
                        {t('appointments.note')}: {appointment.note}
                      </p>
                    ) : null}
                  </div>
                  {appointment.status === 'CANCELLED' ? (
                    <span className={styles.tag}>{t('appointments.cancelled')}</span>
                  ) : scope === 'upcoming' ? (
                    <form action={cancelAppointmentAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={appointment.id} />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        pendingLabel={t('appointments.cancelling')}
                      >
                        {t('appointments.cancel')}
                        <span className="visually-hidden"> — {appointment.name}</span>
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
