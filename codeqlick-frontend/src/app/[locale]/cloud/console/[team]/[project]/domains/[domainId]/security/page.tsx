import { PageHeader } from '@/components/ui/PageHeader';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { resolveLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import {
  getCloudSurface,
  getCloudSurfaceScan,
  listCloudProjects,
  type SurfaceScan,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import {
  checkTitle,
  describeSurfaceChange,
  gradeBadgeTone,
  gradeBand,
  scanIdParam,
  scanMark,
} from '@/lib/surface';
import { SecurityFindings } from '@/app/[locale]/(site)/security-check/SecurityFindings';
import appUi from '@/components/layout/AppPage.module.css';
import report from '@/app/[locale]/(site)/security-check/security-check.module.css';
import styles from '@/app/[locale]/cloud/cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string; team: string; project: string; domainId: string }>;
  searchParams: Promise<{ scan?: string | string[] }>;
};

type Translate = Awaited<ReturnType<typeof getTranslations<'Cloud.surface'>>>;

const ID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.surface' });
  return { title: t('pageTitle'), robots: { index: false, follow: false } };
}

/** A domain's Surface monitor: the latest (or chosen) scan, its changes and the history. */
export default async function CloudSurfacePage({ params, searchParams }: PageProps) {
  const { locale: raw, team, project: slug, domainId } = await params;
  const query = await searchParams;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  if (!ID.test(domainId)) notFound();
  const t = await getTranslations({ locale, namespace: 'Cloud.surface' });
  const requested = scanIdParam(query.scan);

  let project;
  let surface;
  let scan: SurfaceScan | null = null;
  try {
    project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) notFound();
    surface = await getCloudSurface(project.id, domainId);
    const shown = requested ?? surface.last?.id ?? null;
    if (shown) scan = await getCloudSurfaceScan(shown, locale);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  // A scan of another domain is not this page's.
  if (scan && scan.domain.id !== domainId) notFound();
  const tab = `/cloud/console/${team}/${slug}?tab=domains`;
  const base = `/cloud/console/${team}/${slug}/domains/${domainId}/security`;
  const older = scan !== null && surface.last !== null && scan.id !== surface.last.id;

  return (
    <div className={styles.landing}>
      <PageHeader back={{ href: tab, label: project.name }} title={<>{surface.domain.name}</>}>
        <p className={styles.rowTitle}>
          <Badge tone={surface.enabled ? 'success' : 'neutral'}>
            {surface.enabled ? t('on') : t('off')}
          </Badge>
          {surface.enabled && surface.nextAt ? (
            <span className={styles.small}>
              {t('next', { when: formatWhen(surface.nextAt, locale) })}
            </span>
          ) : null}
        </p>
        <p className={styles.small}>{t('passiveNote')}</p>
      </PageHeader>

      {older ? (
        <Alert tone="info">
          {t('olderNotice')} <Link href={base}>{t('seeLatest')}</Link>
        </Alert>
      ) : null}

      {scan ? (
        <ScanView scan={scan} locale={locale} t={t} />
      ) : (
        <section className={appUi.card} aria-labelledby="surface-empty">
          <h2 id="surface-empty" className={appUi.cardTitle}>
            {t('emptyTitle')}
          </h2>
          <p className={styles.muted}>
            {surface.enabled && surface.nextAt
              ? t('first', { when: formatWhen(surface.nextAt, locale) })
              : t('emptyOff')}
          </p>
          {!surface.enabled ? <Link href={tab}>{t('turnOn')}</Link> : null}
        </section>
      )}

      {surface.scans.length > 0 ? (
        <section className={appUi.card} aria-labelledby="surface-history">
          <h2 id="surface-history" className={appUi.cardTitle}>
            {t('historyTitle')}
          </h2>
          <table className={styles.history}>
            <caption className="visually-hidden">{t('historyCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('date')}</th>
                <th scope="col">{t('grade')}</th>
                <th scope="col">{t('result')}</th>
              </tr>
            </thead>
            <tbody>
              {surface.scans.map((item) => {
                const mark = scanMark(item);
                return (
                  <tr key={item.id} aria-current={scan?.id === item.id ? 'true' : undefined}>
                    <th scope="row">
                      <Link href={`${base}?scan=${item.id}`}>
                        {formatWhen(item.createdAt, locale)}
                      </Link>
                    </th>
                    <td>
                      {item.status === 'DONE' && item.grade ? (
                        <Badge tone={gradeBadgeTone(item.grade)}>{item.grade}</Badge>
                      ) : (
                        <span aria-hidden="true">–</span>
                      )}
                    </td>
                    <td>
                      {mark === 'failed' ? (
                        <Badge tone="danger">{t('failedBadge')}</Badge>
                      ) : mark === 'changes' ? (
                        <Badge tone="warning">{t('changesBadge', { count: item.changes })}</Badge>
                      ) : (
                        <span className={styles.small}>{t('steady')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function ScanView({ scan, locale, t }: { scan: SurfaceScan; locale: string; t: Translate }) {
  const when = formatWhen(scan.createdAt, locale);
  if (scan.status === 'FAILED') {
    return (
      <section className={appUi.card} aria-labelledby="surface-scan">
        <h2 id="surface-scan" className={appUi.cardTitle}>
          {t('scanTitle', { when })}
        </h2>
        <Alert tone="error">
          <strong>{t('failedTitle')}.</strong>{' '}
          {scan.failure ?? t(`failedReasons.${scan.error ?? 'error'}`)}
        </Alert>
        <p className={styles.small}>{t('failedNote')}</p>
      </section>
    );
  }
  const score = scan.score ?? 0;
  const grade = scan.grade ?? '–';
  const tone = gradeBand(scan.grade);
  return (
    <>
      <section aria-labelledby="surface-scan" className={appUi.card}>
        <div className={report.reportHead}>
          <div
            className={report.score}
            data-grade={tone}
            style={{ '--value': score } as React.CSSProperties}
          >
            <span className="visually-hidden">{t('gradeLabel', { grade, score })}</span>
            <span aria-hidden="true">
              <span className={report.grade}>{grade}</span>
              <span className={report.gradePoints}>{score}/100</span>
            </span>
          </div>
          <div>
            <h2 id="surface-scan" className={appUi.cardTitle}>
              {t('scanTitle', { when })}
            </h2>
            {scan.previous ? (
              <p className={styles.small}>
                {t('previous', {
                  grade: scan.previous.grade ?? '–',
                  score: scan.previous.score ?? 0,
                  when: formatWhen(scan.previous.createdAt, locale),
                })}
              </p>
            ) : (
              <p className={styles.small}>{t('baseline')}</p>
            )}
          </div>
        </div>
      </section>

      <section className={appUi.card} aria-labelledby="surface-changes">
        <h2 id="surface-changes" className={appUi.cardTitle}>
          {t('changesTitle')}
        </h2>
        {!scan.previous ? (
          <p className={styles.muted}>{t('changesBaseline')}</p>
        ) : scan.changes.length === 0 ? (
          <p className={styles.muted}>{t('changesNone')}</p>
        ) : (
          <ul className={styles.list}>
            {scan.changes.map((change, index) => (
              <li key={index} className={styles.row}>
                <ChangeItem change={change} scan={scan} t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <SecurityFindings groups={scan.groups} />
      </div>
    </>
  );
}

function ChangeItem({
  change,
  scan,
  t,
}: {
  change: SurfaceScan['changes'][number];
  scan: SurfaceScan;
  t: Translate;
}) {
  const text = describeSurfaceChange(change, (id) => checkTitle(scan.groups, id));
  const values = { ...text.values };
  if (change.kind === 'check') {
    values.from = t(`status.${change.from}`);
    values.to = t(`status.${change.to}`);
  } else if (change.kind === 'records') {
    values.record = t(`records.${change.record}`);
  }
  return (
    <div className={styles.rowMain}>
      <p className={styles.rowTitle}>{t(`changes.${text.key}`, values)}</p>
      {text.removed.length > 0 ? (
        <p className={styles.small}>
          {t('removed')} <span className={styles.mono}>{text.removed.join(' · ')}</span>
        </p>
      ) : null}
      {text.added.length > 0 ? (
        <p className={styles.small}>
          {t('added')} <span className={styles.mono}>{text.added.join(' · ')}</span>
        </p>
      ) : null}
      {text.more > 0 ? <p className={styles.small}>{t('more', { count: text.more })}</p> : null}
    </div>
  );
}
