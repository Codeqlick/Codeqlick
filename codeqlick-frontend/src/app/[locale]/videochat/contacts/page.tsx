import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getVideochatStatus, listVideochatContacts } from '@/lib/api/videochat';
import { requireUser } from '@/lib/auth/session';
import { isInterest } from '@/lib/videochat-interests';
import { countryFlag, countryName } from '@/lib/videochat-options';
import styles from '../videochat.module.css';
import { removeContactAction } from './actions';
import { appPath } from '@/lib/webapp-request';

/** Behind the account: nothing here for search engines. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/** Mutual contacts: who is here now, call them, remove them (architecture 4.7). */
export default async function VideochatContactsPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  await requireUser(locale, `/${locale}/videochat/contacts`);
  const t = await getTranslations({ locale, namespace: 'Videochat.contacts' });
  const tg = await getTranslations({ locale, namespace: 'Videochat.genders' });
  const ti = await getTranslations({ locale, namespace: 'Videochat.interests' });
  const tv = await getTranslations({ locale, namespace: 'Videochat' });
  const status = await getVideochatStatus();
  if (!status.profile) redirect(await appPath(`/${locale}/videochat/room`, locale));
  const { items } = await listVideochatContacts();
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <section className={styles.panel}>
      <h1 className={styles.pageTitle}>{t('title')}</h1>
      <p className={styles.muted}>{t('lead')}</p>
      {items.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <ul className={styles.contacts}>
          {items.map((contact) => {
            const free = contact.online && !contact.busy;
            const state = !contact.online ? 'offline' : contact.busy ? 'busy' : 'online';
            return (
              <li key={contact.contactId} className={styles.contact}>
                <div className={styles.contactMain}>
                  <p className={styles.contactName}>
                    <span
                      className={`${styles.presence} ${styles[`presence_${state}`]}`}
                      aria-hidden="true"
                    />
                    {contact.nickname ?? t('anonymous')}
                    {contact.verified ? <VerifiedBadge label={tv('verified')} /> : null}
                    {contact.gender ? ` · ${tg(contact.gender)}` : ''}
                    {contact.country
                      ? ` · ${countryFlag(contact.country)} ${countryName(contact.country, locale)}`
                      : ''}
                  </p>
                  <p className={styles.contactMeta}>
                    {t(state)} · {t('since', { date: date(contact.since) })}
                  </p>
                  {contact.interests.length ? (
                    <ul className={styles.contactInterests} aria-label={t('interests')}>
                      {contact.interests.map((interest) => (
                        <li key={interest}>{isInterest(interest) ? ti(interest) : interest}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className={styles.contactActions}>
                  {free ? (
                    <>
                      <Link
                        href={`/videochat/room?call=${contact.contactId}`}
                        className={styles.callButton}
                      >
                        {t('call')}
                      </Link>
                      <Link
                        href={`/videochat/room?group=${contact.contactId}`}
                        className={styles.callButton}
                      >
                        {t('group')}
                      </Link>
                    </>
                  ) : (
                    <span className={`${styles.callButton} ${styles.callDisabled}`} aria-disabled>
                      {t('call')}
                    </span>
                  )}
                  <form action={removeContactAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="contactId" value={contact.contactId} />
                    <SubmitButton variant="ghost" size="sm">
                      {t('remove')}
                    </SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p>
        <Link href="/videochat/contacts" className={styles.inlineLink}>
          {t('refresh')}
        </Link>
      </p>
    </section>
  );
}
