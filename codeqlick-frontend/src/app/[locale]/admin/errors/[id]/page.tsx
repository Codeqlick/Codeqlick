import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { adminGetError } from '@/lib/api/error-reports';
import { formatDateTime } from '@/lib/format';
import { errorStatusAction } from '../actions';
import { ErrorSourceBadge } from '../ErrorSourceBadge';

type PageProps = { params: Promise<{ locale: string; id: string }> };

export default async function AdminErrorPage({ params }: PageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'AdminErrors' });

  const error = await adminGetError(id).catch((failure: unknown) => {
    if (isApiError(failure) && (failure.status === 404 || failure.status === 400)) notFound();
    throw failure;
  });

  const facts: Array<[string, string]> = [
    [t('count'), String(error.count)],
    [t('firstSeen'), formatDateTime(error.firstSeenAt, locale)],
    [t('lastSeen'), formatDateTime(error.lastSeenAt, locale)],
    [t('request'), [error.method, error.path].filter(Boolean).join(' ') || '—'],
    [t('reference'), error.reference ?? '—'],
    [
      t('status'),
      error.resolvedAt
        ? t('resolvedOn', { date: formatDateTime(error.resolvedAt, locale) })
        : t('open'),
    ],
  ];

  return (
    <div className={styles.stack}>
      <PageHeader title={t('detailTitle')} back={{ href: '/admin/errors', label: t('back') }} />

      <section className={styles.panel}>
        <p>
          <ErrorSourceBadge source={error.source} locale={locale} />
        </p>
        <p className={styles.prewrap}>
          <strong>{error.message}</strong>
        </p>
        <dl className={styles.facts}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {error.userAgent ? <p className={styles.muted}>{error.userAgent}</p> : null}
        <ActionForm action={errorStatusAction.bind(null, locale, error.id)}>
          {error.resolvedAt ? (
            <SubmitButton size="sm" variant="outline" name="decision" value="reopen">
              {t('reopen')}
            </SubmitButton>
          ) : (
            <SubmitButton size="sm" name="decision" value="resolve">
              {t('resolve')}
            </SubmitButton>
          )}
        </ActionForm>
      </section>

      {error.stack ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('stack')}</h2>
          <pre className={styles.code}>{error.stack}</pre>
        </section>
      ) : null}
    </div>
  );
}
