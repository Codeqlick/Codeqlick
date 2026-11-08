import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { listMeetingRooms, type MeetingRoom } from '@/lib/api/meetings';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { createRoomAction, deleteRoomAction, joinByCodeAction, toggleLobbyAction } from './actions';
import styles from './meetings.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** This host's public origin (behind Nginx the request says http). */
async function publicOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get('host') ?? 'meetings.codeqlick.com';
  const protocol = list.get('x-forwarded-proto') ?? (env.isProduction ? 'https' : 'http');
  return `${protocol}://${host}`;
}

/** meetings.codeqlick.com: what it is, join with a code, and the signed-in person's rooms. */
export default async function MeetingsLandingPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meetings' });
  const user = await getCurrentUser();
  let rooms: MeetingRoom[] | null = null;
  if (user) rooms = await listMeetingRooms().catch(() => null);
  const origin = await publicOrigin();
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{t('landing.eyebrow')}</p>
          <h1 className={styles.heroTitle}>{t('landing.title')}</h1>
          <p className={styles.heroLead}>{t('landing.lead')}</p>
          {user ? null : (
            <div className={styles.actions}>
              <Button href="/register">{t('landing.createAccount')}</Button>
              <Button href="/login?next=/meetings" variant="outline">
                {t('signIn')}
              </Button>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t('landing.joinTitle')}</h2>
          <ActionForm action={joinByCodeAction} className={styles.form}>
            <input type="hidden" name="locale" value={locale} />
            <FormInput
              id="code"
              name="code"
              label={t('landing.codeLabel')}
              placeholder="abc-defg-hjk"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <SubmitButton>{t('landing.join')}</SubmitButton>
          </ActionForm>
          <p className={styles.muted}>{t('landing.joinNote')}</p>
        </div>
      </section>

      {user ? (
        <section aria-labelledby="rooms-title">
          <h2 id="rooms-title" className={styles.sectionTitle}>
            {t('rooms.title')}
          </h2>
          <div className={styles.card}>
            <ActionForm action={createRoomAction} className={styles.form}>
              <input type="hidden" name="locale" value={locale} />
              <FormInput
                id="title"
                name="title"
                label={t('rooms.newLabel')}
                placeholder={t('rooms.newPlaceholder')}
                maxLength={80}
                required
              />
              <SubmitButton>{t('rooms.create')}</SubmitButton>
            </ActionForm>
          </div>

          {rooms === null ? (
            <p className={styles.muted}>{t('rooms.loadError')}</p>
          ) : rooms.length === 0 ? (
            <p className={styles.muted}>{t('rooms.empty')}</p>
          ) : (
            <ul className={styles.rooms} style={{ marginTop: 'var(--space-6)' }}>
              {rooms.map((room) => (
                <li key={room.id} className={styles.room}>
                  <div className={styles.roomHead}>
                    <p className={styles.roomTitle}>{room.title}</p>
                    {room.live > 0 ? (
                      <span className={styles.live}>{t('rooms.live', { count: room.live })}</span>
                    ) : null}
                  </div>
                  <span className={styles.code}>
                    {room.lastUsedAt
                      ? t('rooms.lastUsed', { date: dateFormat.format(new Date(room.lastUsedAt)) })
                      : t('rooms.neverUsed')}
                  </span>
                  <CopyLink
                    url={`${origin}/${locale}/${room.code}`}
                    labels={{ copy: t('rooms.copy'), copied: t('rooms.copied') }}
                  />
                  <div className={styles.actions}>
                    <Button href={`/meetings/${room.code}`} size="sm">
                      {t('rooms.open')}
                    </Button>
                    <form action={toggleLobbyAction} className={styles.inline}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={room.id} />
                      <input type="hidden" name="lobby" value={room.lobby ? 'off' : 'on'} />
                      <SubmitButton variant="outline" size="sm">
                        {room.lobby ? t('rooms.lobbyOn') : t('rooms.lobbyOff')}
                      </SubmitButton>
                    </form>
                    <form action={deleteRoomAction} className={styles.inline}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={room.id} />
                      <SubmitButton variant="ghost" size="sm">
                        {t('rooms.delete')}
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="features-title">
        <h2 id="features-title" className={styles.sectionTitle}>
          {t('landing.featuresTitle')}
        </h2>
        <ul className={styles.features}>
          {(['1', '2', '3', '4'] as const).map((n) => (
            <li key={n}>
              <strong>{t(`landing.feature${n}Title`)}</strong>
              <span>{t(`landing.feature${n}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
