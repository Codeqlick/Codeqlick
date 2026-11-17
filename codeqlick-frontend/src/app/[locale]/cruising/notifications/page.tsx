import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/cruising/Cruising.module.css';
import { MemberName } from '@/components/cruising/MemberName';
import { SubmitButton } from '@/components/ui/SubmitButton';
import card from '@/components/cruising/CruisingCard.module.css';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import { getCruisingStatus } from '@/lib/api/cruising';
import {
  getCruisingVisits,
  listCruisingNotifications,
  listCruisingWinks,
} from '@/lib/api/cruising-notifications';
import { requireUser } from '@/lib/auth/session';
import { memberHref } from '@/lib/cruising';
import {
  isNotificationKind,
  notificationCount,
  notificationHref,
  notificationView,
  NOTIFICATIONS_HREF,
  verificationOutcome,
  type CruisingNotification,
  type NotificationView,
} from '@/lib/cruising-notifications';
import { firstParam, formatDateTime } from '@/lib/format';
import adult from '@/components/adult/adult.module.css';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { startConversationAction } from '../actions';
import { CruisingGate } from '../Gate';
import { markAllReadAction, winkAction } from '../notifications-actions';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
};

/**
 * The notification centre (decision 98): what happened in the last 30 days, with links; the winks
 * I received and my visitors (decision 97) in their own views.
 */
export default async function CruisingNotificationsPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const view = notificationView(firstParam((await searchParams).view));
  await requireUser(locale, `/${locale}/cruising/notifications`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.notifications' });
  const centre = await listCruisingNotifications();

  const tabs: { key: NotificationView; label: string; href: string }[] = [
    {
      key: 'all',
      label: centre.unread > 0 ? t('tabAllUnread', { count: centre.unread }) : t('tabAll'),
      href: NOTIFICATIONS_HREF,
    },
    { key: 'winks', label: t('tabWinks'), href: `${NOTIFICATIONS_HREF}?view=winks` },
    { key: 'visitors', label: t('tabVisitors'), href: `${NOTIFICATIONS_HREF}?view=visitors` },
  ];

  return (
    <>
      <h1 className={adult.pageTitle}>{t('title')}</h1>
      <p className={adult.muted}>{t('lead')}</p>
      <Tabs
        variant="pills"
        label={t('viewsLabel')}
        className={styles.notificationTabs}
        items={tabs.map((tab) => ({
          key: tab.key,
          href: tab.href,
          label: tab.label,
          current: tab.key === view,
        }))}
      />
      {view === 'winks' ? (
        <WinksView locale={locale} hasNickname={!!status.profile?.nickname} />
      ) : view === 'visitors' ? (
        <VisitorsView locale={locale} />
      ) : (
        <>
          {centre.unread > 0 ? (
            <ActionForm action={markAllReadAction.bind(null, locale)}>
              <SubmitButton variant="outline" size="sm" pendingLabel={t('marking')}>
                {t('markAllRead')}
              </SubmitButton>
            </ActionForm>
          ) : null}
          {centre.items.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              body={t('emptyBody')}
              action={<Button href="/cruising/map">{t('emptyAction')}</Button>}
            />
          ) : (
            <ul className={styles.notificationList}>
              {centre.items.map((item) => (
                <NotificationRow key={item.id} locale={locale} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

async function NotificationRow({
  locale,
  item,
}: {
  locale: AppLocale;
  item: CruisingNotification;
}) {
  const t = await getTranslations({ locale, namespace: 'Cruising.notifications' });
  if (!isNotificationKind(item.kind)) return null;
  const text =
    item.kind === 'VERIFICATION_DECIDED'
      ? t(`verification.${verificationOutcome(item)}`)
      : t(`kinds.${item.kind}`, { count: notificationCount(item) });
  const href = notificationHref(item);
  return (
    <li
      className={[card.card, styles.notificationItem, item.read ? '' : card.unread]
        .filter(Boolean)
        .join(' ')}
    >
      <span>
        {item.read ? null : <span className={styles.srOnly}>{t('unread')} </span>}
        {href ? (
          <Link href={href} className={adult.inlineLink}>
            {text}
          </Link>
        ) : (
          text
        )}
        {item.spot ? <span className={adult.muted}> · {item.spot.name}</span> : null}
      </span>
      <time dateTime={item.at} className={adult.muted}>
        {formatDateTime(item.at, locale)}
      </time>
    </li>
  );
}

async function WinksView({ locale, hasNickname }: { locale: AppLocale; hasNickname: boolean }) {
  const t = await getTranslations({ locale, namespace: 'Cruising.winks' });
  const tm = await getTranslations({ locale, namespace: 'Cruising.members' });
  const winks = await listCruisingWinks().catch(() => []);
  return (
    <section aria-labelledby="winks-title">
      <h2 id="winks-title" className={adult.sectionTitle}>
        {t('title')}
      </h2>
      <p className={adult.muted}>{t('lead')}</p>
      {winks.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className={styles.notificationList}>
          {winks.map((wink) => (
            <li key={wink.nickname} className={`${card.card} ${styles.notificationItem}`}>
              <span>
                <MemberName locale={locale} member={{ ...wink, coverId: null }}>
                  <Link href={memberHref(wink.nickname)} className={adult.inlineLink}>
                    {wink.nickname}
                  </Link>
                </MemberName>{' '}
                <time dateTime={wink.at} className={adult.muted}>
                  {formatDateTime(wink.at, locale)}
                </time>
              </span>
              {hasNickname ? (
                <span className={styles.profileActions}>
                  {wink.mutual ? (
                    <span className={adult.muted}>{t('mutual')}</span>
                  ) : (
                    <ActionForm action={winkAction.bind(null, locale, wink.nickname)}>
                      <SubmitButton variant="outline" size="sm" pendingLabel={t('sending')}>
                        {t('winkBack')}
                      </SubmitButton>
                    </ActionForm>
                  )}
                  <ActionForm action={startConversationAction.bind(null, locale, wink.nickname)}>
                    <SubmitButton size="sm" pendingLabel={tm('opening')}>
                      {tm('message')}
                    </SubmitButton>
                  </ActionForm>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function VisitorsView({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Cruising.visits' });
  const visits = await getCruisingVisits().catch(() => ({ showVisits: false, items: [] }));
  return (
    <section aria-labelledby="visitors-title">
      <h2 id="visitors-title" className={adult.sectionTitle}>
        {t('title')}
      </h2>
      {!visits.showVisits ? (
        <p>
          {t('off')}{' '}
          <Link href="/cruising/me#me-visits" className={adult.inlineLink}>
            {t('turnOn')}
          </Link>
        </p>
      ) : visits.items.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <>
          <p className={adult.muted}>{t('lead')}</p>
          <ul className={styles.notificationList}>
            {visits.items.map((visitor) => (
              <li key={visitor.nickname} className={`${card.card} ${styles.notificationItem}`}>
                <MemberName locale={locale} member={{ ...visitor, coverId: null }}>
                  <Link href={memberHref(visitor.nickname)} className={adult.inlineLink}>
                    {visitor.nickname}
                  </Link>
                </MemberName>
                <time dateTime={visitor.at} className={adult.muted}>
                  {formatDateTime(visitor.at, locale)}
                </time>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
