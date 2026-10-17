import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormTextarea } from '@/components/app/ActionForm';
import { DomainField } from '@/components/app/DomainField';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { RowsField } from '@/components/app/RowsField';
import { Badge } from '@/components/ui/Badge';
import { FilePicker } from '@/components/ui/FilePicker';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { isNotFound } from '@/lib/api/errors';
import { getMySite } from '@/lib/api/portal-site';
import { formatDateTime } from '@/lib/format';
import { saveSiteAction, setSiteDomainAction, applyDomainEmailAction } from './actions';
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
  const rowLabels = (legend: string, add: string, hint?: string) => ({
    legend,
    hint,
    add,
    remove: t('removeRow'),
    line: t('row'),
  });

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

      {/* Not keyed: the result message stays; inputs reset to the saved values on their own. */}
      <ActionForm action={saveSiteAction.bind(null, locale, id)} className={styles.stack}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('heroTitle')}</h2>
          <div className={styles.form}>
            <FormInput
              id="heroTitle"
              name="heroTitle"
              label={t('headline')}
              defaultValue={editable.hero.title}
              required
              maxLength={120}
            />
            <FormTextarea
              id="heroText"
              name="heroText"
              label={t('heroText')}
              defaultValue={editable.hero.text}
              rows={3}
              required
              maxLength={400}
            />
            <FormInput
              id="tagline"
              name="tagline"
              label={t('tagline')}
              hint={t('taglineHint')}
              defaultValue={editable.tagline}
              maxLength={80}
            />
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('contactTitle')}</h2>
          <div className={styles.form}>
            <div className={styles.row}>
              <FormInput
                id="phone"
                name="phone"
                type="tel"
                label={t('phone')}
                defaultValue={editable.contact.phone}
                maxLength={30}
              />
              <FormInput
                id="whatsapp"
                name="whatsapp"
                type="tel"
                label={t('whatsapp')}
                hint={t('whatsappHint')}
                defaultValue={editable.contact.whatsapp}
                maxLength={20}
              />
              <FormInput
                id="email"
                name="email"
                type="email"
                label={t('email')}
                defaultValue={editable.contact.email}
                maxLength={254}
              />
            </div>
            <div className={styles.row}>
              <FormInput
                id="street"
                name="street"
                label={t('street')}
                defaultValue={editable.contact.address?.street}
                maxLength={120}
              />
              <FormInput
                id="postalCode"
                name="postalCode"
                label={t('postalCode')}
                defaultValue={editable.contact.address?.postalCode}
                maxLength={10}
              />
              <FormInput
                id="city"
                name="city"
                label={t('city')}
                defaultValue={editable.contact.address?.city}
                maxLength={80}
              />
              <FormInput
                id="region"
                name="region"
                label={t('region')}
                defaultValue={editable.contact.address?.region}
                maxLength={80}
              />
            </div>
            <RowsField
              name="hours"
              columns={[
                { key: 'days', label: t('days'), placeholder: t('daysPlaceholder'), maxLength: 60 },
                {
                  key: 'hours',
                  label: t('hours'),
                  placeholder: t('hoursPlaceholder'),
                  maxLength: 60,
                },
              ]}
              initial={editable.hours ?? []}
              labels={rowLabels(t('hoursTitle'), t('addHours'))}
              max={10}
            />
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('servicesTitle')}</h2>
          <div className={styles.form}>
            <FormInput
              id="servicesTitle"
              name="servicesTitle"
              label={t('sectionTitle')}
              defaultValue={editable.services?.title}
              maxLength={80}
            />
            <FormTextarea
              id="servicesIntro"
              name="servicesIntro"
              label={t('intro')}
              defaultValue={editable.services?.intro}
              rows={2}
              maxLength={300}
            />
            <RowsField
              name="services"
              columns={[
                { key: 'name', label: t('serviceName'), width: '1.2fr', maxLength: 80 },
                {
                  key: 'description',
                  label: t('serviceDescription'),
                  width: '2fr',
                  maxLength: 200,
                },
                {
                  key: 'price',
                  label: t('price'),
                  width: '8rem',
                  placeholder: '25 €',
                  maxLength: 30,
                },
              ]}
              initial={editable.services?.items ?? []}
              labels={rowLabels(t('servicesList'), t('addService'))}
            />
            <FormInput
              id="servicesNote"
              name="servicesNote"
              label={t('note')}
              defaultValue={editable.services?.note}
              maxLength={300}
            />
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('aboutTitle')}</h2>
          <div className={styles.form}>
            <FormInput
              id="aboutTitle"
              name="aboutTitle"
              label={t('sectionTitle')}
              defaultValue={editable.about?.title}
              maxLength={120}
            />
            <FormTextarea
              id="aboutText"
              name="aboutText"
              label={t('aboutText')}
              hint={t('aboutHint')}
              defaultValue={editable.about?.paragraphs.join('\n\n')}
              rows={8}
            />
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('galleryTitle')}</h2>
          <div className={styles.form}>
            <FormInput
              id="galleryTitle"
              name="galleryTitle"
              label={t('sectionTitle')}
              defaultValue={editable.gallery?.title}
              maxLength={80}
            />
            {(editable.gallery?.images ?? []).length > 0 ? (
              <ul className={siteStyles.photos}>
                {(editable.gallery?.images ?? []).map((image, index) => (
                  <li key={image.file} className={siteStyles.photo}>
                    {/* oxlint-disable-next-line nextjs/no-img-element -- uploads come from the API route, demo photos from public/presets */}
                    <img
                      src={
                        image.file.startsWith('media/')
                          ? `/${image.file}`
                          : `/presets/${site.preset}/${image.file}`
                      }
                      alt=""
                      className={siteStyles.thumb}
                    />
                    <input type="hidden" name="gallery.file" value={image.file} />
                    <FormInput
                      id={`gallery-alt-${index}`}
                      name="gallery.alt"
                      label={t('photoAlt')}
                      defaultValue={image.alt}
                      maxLength={200}
                    />
                    <label className={siteStyles.remove}>
                      <input type="checkbox" name="gallery.remove" value={image.file} />
                      {t('removePhoto')}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>{t('noPhotos')}</p>
            )}
            <div className={styles.row}>
              <div>
                <FilePicker
                  name="newPhoto"
                  label={t('addPhoto')}
                  accept="image/jpeg,image/png,image/webp"
                />
                <p className={styles.muted}>{t('photoHint')}</p>
              </div>
              <FormInput
                id="newPhotoAlt"
                name="newPhotoAlt"
                label={t('newPhotoAlt')}
                hint={t('altHint')}
                maxLength={200}
              />
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('reviewsTitle')}</h2>
          <div className={styles.form}>
            <FormInput
              id="reviewsTitle"
              name="reviewsTitle"
              label={t('sectionTitle')}
              defaultValue={editable.testimonials?.title}
              maxLength={80}
            />
            <RowsField
              name="reviews"
              columns={[
                { key: 'quote', label: t('quote'), width: '2fr', multiline: true, maxLength: 600 },
                { key: 'author', label: t('author'), width: '1fr', maxLength: 80 },
                { key: 'detail', label: t('detail'), width: '1fr', maxLength: 80 },
              ]}
              initial={editable.testimonials?.items ?? []}
              labels={rowLabels(t('reviewsList'), t('addReview'), t('reviewsHint'))}
              max={9}
            />
            <FormInput
              id="reviewUrl"
              name="reviewUrl"
              type="url"
              label={t('reviewUrl')}
              hint={t('reviewUrlHint')}
              placeholder="https://g.page/r/…/review"
              defaultValue={editable.contact.reviewUrl}
              maxLength={500}
            />
            <p className={styles.muted}>
              <Link href={`/portal/projects/${id}/site/reviews`}>{t('reviewKitLink')}</Link>
            </p>
          </div>
        </section>

        <div className={styles.actions}>
          <SubmitButton pendingLabel={t('publishing')}>{t('save')}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
