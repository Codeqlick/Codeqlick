import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SwipeChat } from '@/components/swipe/SwipeChat';
import { resolveLocale } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { getSwipeStatus, listSwipeMatches, listSwipeMessages } from '@/lib/api/swipe';
import { requireUser } from '@/lib/auth/session';
import { messagesAction, reportAction, sendMessageAction, unmatchAction } from '../../actions';
import { SwipeGate } from '../../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string; id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The chat with one match. */
export default async function SwipeChatPage({ params }: PageProps) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  await requireUser(locale, `/${locale}/swipe/matches/${id}`);
  if (!UUID.test(id)) notFound();
  const status = await getSwipeStatus();
  const gate = await SwipeGate({ locale, status });
  if (gate) return gate;
  const match = (await listSwipeMatches()).find((item) => item.id === id);
  if (!match) notFound();
  let messages;
  try {
    messages = await listSwipeMessages(id);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }

  return (
    <SwipeChat
      locale={locale}
      matchId={id}
      nickname={match.partner.nickname}
      bio={match.partner.bio}
      verified={match.partner.verified}
      initial={messages}
      load={messagesAction}
      send={sendMessageAction}
      end={unmatchAction}
      report={reportAction}
    />
  );
}
