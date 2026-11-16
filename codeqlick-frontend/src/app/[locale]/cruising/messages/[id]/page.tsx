import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import { AlbumShare } from '@/components/cruising/AlbumShare';
import { CruisingChat } from '@/components/cruising/CruisingChat';
import styles from '@/components/cruising/Cruising.module.css';
import { MemberGallery } from '@/components/cruising/MemberGallery';
import { MemberName } from '@/components/cruising/MemberName';
import { ReportDetails } from '@/components/cruising/ReportDetails';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import {
  getCruisingStatus,
  listCruisingConversations,
  listCruisingMemberMedia,
  listCruisingMessages,
  type CruisingMessage,
} from '@/lib/api/cruising';
import { getCruisingAlbumGrants } from '@/lib/api/cruising-rooms';
import { requireUser } from '@/lib/auth/session';
import { memberHref, messagesEndpoint } from '@/lib/cruising';
import { hasGiven, hasReceived, NO_GRANTS } from '@/lib/cruising-rooms';
import { appPath, requestWebapp } from '@/lib/webapp-request';
import vc from '../../../videochat/videochat.module.css';
import { blockConversationAction, leaveConversationAction, sendMessageAction } from '../../actions';
import { CruisingGate } from '../../Gate';

/** Private: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string; id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The chat with one member: it polls every 4 seconds through a route handler. */
export default async function CruisingChatPage({ params }: PageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveCruisingLocale(rawLocale);
  await requireUser(locale, `/${locale}/cruising/messages/${id}`);
  if (!UUID.test(id)) notFound();
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  if (!status.profile) redirect(await appPath(`/${locale}/cruising/me`, locale));
  const conversation = (await listCruisingConversations()).find((item) => item.id === id);
  if (!conversation) notFound();
  let messages: CruisingMessage[];
  try {
    messages = await listCruisingMessages(id);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const t = await getTranslations({ locale, namespace: 'Cruising.chat' });
  const onHost = (await requestWebapp()) === 'cruising';
  const partner = conversation.partner.nickname;
  const grants = await getCruisingAlbumGrants().catch(() => NO_GRANTS);
  // Their private album, when they shared it with me: collapsed, so it opens on purpose.
  const theirPrivate = hasReceived(grants, partner)
    ? (await listCruisingMemberMedia(partner).catch(() => [])).filter(
        (item) => item.album === 'PRIVATE',
      )
    : [];
  const ta = await getTranslations({ locale, namespace: 'Cruising.album' });

  return (
    <>
      <p>
        <Link href="/cruising/messages" className={vc.inlineLink}>
          {t('back')}
        </Link>
      </p>
      <h1 className={vc.pageTitle}>
        <MemberName locale={locale} member={conversation.partner}>
          <Link href={memberHref(partner)} className={styles.convName}>
            {partner}
          </Link>
        </MemberName>
      </h1>
      <CruisingChat
        locale={locale}
        conversationId={id}
        partner={partner}
        initial={messages}
        pollUrl={messagesEndpoint(locale, onHost, id)}
        send={sendMessageAction}
      />
      {theirPrivate.length > 0 ? (
        <details className={styles.disclosure}>
          <summary>{ta('theirsOpen', { nickname: partner, count: theirPrivate.length })}</summary>
          <MemberGallery
            locale={locale}
            nickname={partner}
            items={theirPrivate}
            own={false}
            album="PRIVATE"
            headingId="conversation-private-album"
          />
        </details>
      ) : null}
      <div className={styles.chatTools}>
        <AlbumShare locale={locale} nickname={partner} shared={hasGiven(grants, partner)} />
        <details className={styles.disclosure}>
          <summary>{t('leave')}</summary>
          <ActionForm action={leaveConversationAction.bind(null, locale, id)} className={vc.form}>
            <p className={vc.muted}>{t('leaveLead', { nickname: partner })}</p>
            <SubmitButton variant="outline" size="sm" pendingLabel={t('leaving')}>
              {t('leaveConfirm')}
            </SubmitButton>
          </ActionForm>
        </details>
        <details className={styles.disclosure}>
          <summary>{t('block')}</summary>
          <ActionForm action={blockConversationAction.bind(null, locale, id)} className={vc.form}>
            <p className={vc.muted}>{t('blockLead', { nickname: partner })}</p>
            <SubmitButton variant="outline" size="sm" pendingLabel={t('blocking')}>
              {t('blockConfirm')}
            </SubmitButton>
          </ActionForm>
        </details>
        <ReportDetails locale={locale} kind="conversation" id={id} />
      </div>
    </>
  );
}
