import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/cruising/Cruising.module.css';
import { MemberName } from '@/components/cruising/MemberName';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import card from '@/components/cruising/CruisingCard.module.css';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCruisingStatus, listCruisingConversations } from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import { conversationHref, isUnread, previewMessage } from '@/lib/cruising';
import { firstParam, formatDateTime } from '@/lib/format';
import { appPath } from '@/lib/webapp-request';
import vc from '../../videochat/videochat.module.css';
import { CruisingGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ left?: string | string[]; blocked?: string | string[] }>;
};

/** My conversations, the latest first. */
export default async function CruisingMessagesPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const query = await searchParams;
  await requireUser(locale, `/${locale}/cruising/messages`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  // Messages need a nickname: choose one first.
  if (!status.profile) redirect(await appPath(`/${locale}/cruising/me`, locale));
  const t = await getTranslations({ locale, namespace: 'Cruising.messages' });
  const conversations = await listCruisingConversations();

  return (
    <>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{t('lead')}</p>
      {firstParam(query.left) ? <Alert tone="success">{t('left')}</Alert> : null}
      {firstParam(query.blocked) ? <Alert tone="success">{t('blockedDone')}</Alert> : null}
      {conversations.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className={styles.convList}>
          {conversations.map((conversation) => {
            const unread = isUnread(conversation.unread);
            const last = conversation.lastMessage;
            return (
              <li
                key={conversation.id}
                className={unread ? `${card.card} ${card.unread}` : card.card}
              >
                <div className={styles.convHead}>
                  <MemberName locale={locale} member={conversation.partner}>
                    <Link href={conversationHref(conversation.id)} className={styles.convName}>
                      {conversation.partner.nickname}
                      {unread ? <span className={styles.srOnly}> ({t('unread')})</span> : null}
                    </Link>
                  </MemberName>
                  <span className={styles.muted}>
                    {unread ? <Badge tone="brand">{t('unread')}</Badge> : null}{' '}
                    <time dateTime={last?.at ?? conversation.createdAt}>
                      {formatDateTime(last?.at ?? conversation.createdAt, locale)}
                    </time>
                  </span>
                </div>
                <p className={styles.convLast}>
                  {last
                    ? `${last.mine ? `${t('you')}: ` : ''}${previewMessage(last.text)}`
                    : t('noMessages')}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
