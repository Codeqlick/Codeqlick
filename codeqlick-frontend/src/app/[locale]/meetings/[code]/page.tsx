import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { MeetingRoom } from '@/components/meetings/MeetingRoom';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { getPublicMeetingRoom } from '@/lib/api/meetings';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { normalizeMeetingCode } from '@/lib/meetings';
import { meetingTicketAction } from '../actions';
import styles from '../meetings.module.css';

type PageProps = { params: Promise<{ locale: string; code: string }> };

export const metadata: Metadata = {
  // A room's link is private to whoever was given it.
  robots: { index: false, follow: false },
};

/**
 * The signaling WebSocket as this browser opens it: MEETINGS_WS_URL when set, else
 * wss://<this host>/ws in production (Nginx → API), else the local API.
 */
async function websocketUrl(): Promise<string> {
  if (env.MEETINGS_WS_URL) return env.MEETINGS_WS_URL;
  if (!env.isProduction) return 'ws://localhost:4000/v1/meetings/ws';
  const host = (await headers()).get('host');
  return `wss://${host}/ws`;
}

/** A meeting room's link: preview, name, waiting room and the meeting itself. */
export default async function MeetingRoomPage({ params }: PageProps) {
  const { locale: rawLocale, code: rawCode } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Meetings.notFound' });
  const code = normalizeMeetingCode(decodeURIComponent(rawCode));
  const room = code ? await getPublicMeetingRoom(code) : null;

  if (!room) {
    return (
      <section className={styles.notFound}>
        <h1 className={styles.heroTitle}>{t('title')}</h1>
        <p className={styles.muted}>{t('body')}</p>
        <div className={styles.actions}>
          <Button href="/meetings">{t('back')}</Button>
        </div>
      </section>
    );
  }

  const user = await getCurrentUser();
  return (
    <MeetingRoom
      code={room.code}
      title={room.title}
      ownerName={room.ownerName}
      userName={user?.name ?? null}
      userAvatar={user?.avatar ?? null}
      wsUrl={await websocketUrl()}
      getTicket={meetingTicketAction}
    />
  );
}
