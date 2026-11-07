import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import { DomainField } from '@/components/app/DomainField';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMySite } from '@/lib/api/portal-site';
import { formatDateTime } from '@/lib/format';
import { setSiteDomainAction, applyDomainEmailAction } from './actions';
import siteStyles from './site.module.css';

const TONES = { NONE: 'neutral', BUILDING: 'warning', LIVE: 'success', FAILED: 'danger' } as const;
const DOMAIN_TONES = { UNREGISTERED: 'neutral', ELSEWHERE: 'warning', LIVE: 'success' } as const;

/** The client edits their managed website (architecture 8.2): saving publishes it. */
export default async function PortalSitePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'PortalSite' });
  const tm = await getTranslations({ locale, namespace: 'ManagedSite' });
  const tk = (key: string) => tm(key as never);
  const site = await getMySite(id).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const { editable, domain } = site;
  const td = await getTranslations({ locale, namespace: 'SiteRequest' });
  const domainLabels = {
    check: td('domainCheck'),
    checking: td('domainChecking'),
    free: td('domainFree'),
    taken: td('domainTaken'),
    unknown: td('domainUnknown'),
    use: td('domainUse'),
    invalid: td('domainInvalid'),
    failed: td('domainFailed'),
  };

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        back={{ href: `/portal/projects/${id}`, label: t('back') }}
      />
      <section className={styles.panel}>
        <p>
          <Badge tone={TONES[site.status]}>{tk(`statuses.${site.status}`)}</Badge>{' '}
          {site.lastBuildAt
            ? t('lastPublished', { date: formatDateTime(site.lastBuildAt, locale) })
            : null}
        </p>
        <p>
          <a href={site.url} target="_blank" rel="noopener noreferrer">
            {site.url}
          </a>
        </p>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('editorTitle')}</h2>
        <p className={styles.muted}>{t('editorBody')}</p>
        <div className={styles.actions}>
          <Button href={`/portal/projects/${id}/site/editor`}>{t('editorOpen')}</Button>
          <Button href={`/portal/projects/${id}/site/reviews`} variant="outline">
            {t('reviewKit')}
          </Button>
        </div>
      </section>

      <section className={styles.panel} id="domain">
        <h2 className={styles.panelTitle}>{t('domainTitle')}</h2>
        {domain.name ? (
          <div className={siteStyles.domainCard}>
            <p>
              <strong className={siteStyles.domainName}>{domain.name}</strong>{' '}
              <Badge tone={domain.state ? DOMAIN_TONES[domain.state] : 'neutral'}>
                {t(`domainStates.${domain.state ?? 'UNCHECKED'}`)}
              </Badge>
            </p>
            {domain.state === 'LIVE' ? (
              <>
                <p>{t('domainLive', { url: `https://${domain.name}` })}</p>
                <h3 className={siteStyles.subTitle}>{t('mailTitle')}</h3>
                {domain.mail === 'NONE' || domain.mail === null ? (
                  <p>
                    {t.rich('mailCreate', {
                      address: `hola@${domain.name}`,
                      code: (chunks) => <code>{chunks}</code>,
                    })}
                  </p>
                ) : (
                  <>
                    <p>
                      {domain.mail === 'OVH'
                        ? t.rich('mailOvh', {
                            link: (chunks) => (
                              <a
                                href="https://webmail.mail.ovh.net"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {chunks}
                              </a>
                            ),
                          })
                        : t('mailOther')}
                    </p>
                    {domain.mail === 'OVH' ? (
                      <p className={styles.muted}>
                        {t.rich('mailPhone', { code: (chunks) => <code>{chunks}</code> })}
                      </p>
                    ) : null}
                    {editable.contact.email?.toLowerCase().endsWith(`@${domain.name}`) ? null : (
                      <ActionForm action={applyDomainEmailAction.bind(null, locale, id)}>
                        <SubmitButton variant="outline" size="sm" pendingLabel={t('domainSaving')}>
                          {t('mailUse', { address: `hola@${domain.name}` })}
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <ol className={siteStyles.steps}>
                  {domain.state !== 'ELSEWHERE' ? (
                    <li>
                      {t.rich('domainStepRegister', {
                        domain: domain.name,
                        link: (chunks) => (
                          <a
                            href="https://www.ovhcloud.com/es-es/domains/"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {chunks}
                          </a>
                        ),
                      })}
                    </li>
                  ) : (
                    <li>{t('domainRegistered')}</li>
                  )}
                  {domain.nicHandle ? (
                    <li>
                      {t.rich('domainStepContact', {
                        nic: domain.nicHandle,
                        code: (chunks) => <code>{chunks}</code>,
                      })}
                    </li>
                  ) : null}
                </ol>
                {domain.serverIp ? (
                  <p className={styles.muted}>
                    {t.rich('domainOtherRegistrar', {
                      ip: domain.serverIp,
                      code: (chunks) => <code>{chunks}</code>,
                    })}
                  </p>
                ) : null}
                <p className={styles.muted}>{t('domainWaiting', { preview: site.previewUrl })}</p>
              </>
            )}
            <details>
              <summary>{t('domainChange')}</summary>
              <ActionForm
                key={`domain-${domain.name}`}
                action={setSiteDomainAction.bind(null, locale, id)}
                className={styles.form}
              >
                <DomainField
                  id="domainName"
                  name="domainName"
                  label={t('domainLabel')}
                  hint={t('domainChangeHint')}
                  defaultValue={domain.name}
                  labels={domainLabels}
                />
                <div className={styles.actions}>
                  <SubmitButton variant="outline" size="sm" pendingLabel={t('domainSaving')}>
                    {t('domainSave')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </details>
          </div>
        ) : (
          <ActionForm action={setSiteDomainAction.bind(null, locale, id)} className={styles.form}>
            <p className={styles.muted}>{t('domainNone')}</p>
            <DomainField
              id="domainName"
              name="domainName"
              label={t('domainLabel')}
              hint={t('domainHint')}
              labels={domainLabels}
            />
            <div className={styles.actions}>
              <SubmitButton size="sm" pendingLabel={t('domainSaving')}>
                {t('domainSave')}
              </SubmitButton>
            </div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
