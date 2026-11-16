import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import { CruisingChat } from '@/components/cruising/CruisingChat';
import styles from '@/components/cruising/Cruising.module.css';
import { MemberName } from '@/components/cruising/MemberName';
import { ReportDetails } from '@/components/cruising/ReportDetails';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import {
  getCruisingStatus,
  listCruisingConversations,
  listCruisingMessages,
  type CruisingMessage,
} from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import { memberHref, messagesEndpoint } from '@/lib/cruising';
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
  const locale = resolveLocale(rawLocale);
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
      <div className={styles.chatTools}>
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
