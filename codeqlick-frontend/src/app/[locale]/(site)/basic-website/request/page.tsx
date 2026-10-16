import type { Metadata } from 'next';
import Image from 'next/image';
import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput, FormTextarea } from '@/components/app/ActionForm';
import { DomainField } from '@/components/app/DomainField';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { SITE_PRESETS } from '@/lib/api/types';
import { legalOwner } from '@/lib/env';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import home from '../../page.module.css';
import { submitSiteRequest } from './actions';
import styles from './request.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  return pageMetadata({
    locale,
    path: '/basic-website/request',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Time of this request; rendered per request so the form carries when it was served. */
async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}

export default async function SiteRequestPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  const tw = await getTranslations({ locale, namespace: 'BasicWebsite' });
  const tk = (key: string) => tw(key as never);
  const query = await searchParams;
  const sent = firstParam(query.sent) === '1';
  const previewSlug = firstParam(query.preview);
  // Through the waiting page: the preview's address only works once the host publishes it.
  const previewHref =
    previewSlug && /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(previewSlug)
      ? `/basic-website/request/preview/${previewSlug}`
      : null;
  const chosen = SITE_PRESETS.find((key) => key === firstParam(query.style)) ?? 'peluqueria';
  const renderedAt = await requestTime();

  if (sent) {
    return (
      <section className={`wrap ${styles.page}`}>
        <div className={home.intro}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={home.title}>{t('sentTitle')}</h1>
          <p className={home.lead}>{t('sentBody')}</p>
          {previewHref ? (
            <div className={styles.preview}>
              <p>{t('previewBody')}</p>
              <p>
                <Button href={previewHref}>{t('previewOpen')}</Button>
              </p>
              <p className={styles.hint}>{t('previewHint')}</p>
            </div>
          ) : null}
          <p>
            <Button href="/basic-website" variant="outline">
              {t('back')}
            </Button>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`wrap ${styles.page}`}>
      <div className={home.intro}>
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1 className={home.title}>{t('title')}</h1>
        <p className={home.lead}>{t('lead')}</p>
      </div>

      <ActionForm action={submitSiteRequest} className={styles.form}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="renderedAt" value={renderedAt} />

        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t('styleTitle')}</legend>
          <p className={styles.hint}>{t('styleHint')}</p>
          <div className={styles.styles}>
            {SITE_PRESETS.map((key) => (
              <label key={key} className={styles.style}>
                <input type="radio" name="preset" value={key} defaultChecked={key === chosen} />
                <Image
                  src={`/demos/${key}.jpg`}
                  alt=""
                  width={1200}
                  height={750}
                  sizes="(max-width: 960px) 50vw, 25vw"
                  className={styles.cover}
                />
                <span className={styles.styleName}>
                  {tk(`demos.${key}.name`)} <span>{tk(`demos.${key}.kind`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t('businessTitle')}</legend>
          <div className={styles.row}>
            <FormInput
              id="businessName"
              name="businessName"
              label={t('businessName')}
              required
              maxLength={80}
            />
            <FormInput
              id="kind"
              name="kind"
              label={t('kind')}
              placeholder={t('kindPlaceholder')}
              required
              maxLength={80}
            />
          </div>
          <div className={styles.row}>
            <FormInput id="city" name="city" label={t('city')} required maxLength={80} />
            <FormInput
              id="address"
              name="address"
              label={t('address')}
              placeholder={t('addressPlaceholder')}
              maxLength={160}
            />
          </div>
          <div className={styles.row3}>
            <FormInput id="phone" name="phone" type="tel" label={t('phone')} maxLength={30} />
            <FormInput
              id="whatsapp"
              name="whatsapp"
              type="tel"
              label={t('whatsapp')}
              maxLength={30}
            />
            <FormInput
              id="businessEmail"
              name="businessEmail"
              type="email"
              label={t('businessEmail')}
              maxLength={254}
            />
          </div>
          <FormTextarea
            id="hours"
            name="hours"
            label={t('hours')}
            hint={t('hoursHint')}
            placeholder={t('hoursPlaceholder')}
            rows={4}
            maxLength={1000}
          />
          <FormTextarea
            id="services"
            name="services"
            label={t('services')}
            hint={t('servicesHint')}
            placeholder={t('servicesPlaceholder')}
            rows={6}
            maxLength={3000}
          />
          <FormTextarea
            id="about"
            name="about"
            label={t('about')}
            hint={t('aboutHint')}
            rows={5}
            maxLength={3000}
          />
          <FormTextarea
            id="wishes"
            name="wishes"
            label={t('wishes')}
            hint={t('wishesHint')}
            rows={4}
            maxLength={3000}
          />
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t('domainTitle')}</legend>
          <p className={styles.hint}>{t('domainHint')}</p>
          <div className={styles.choices}>
            {(['new', 'owned', 'none'] as const).map((choice) => (
              <label key={choice} className={styles.choice}>
                <input
                  type="radio"
                  name="domainChoice"
                  value={choice}
                  defaultChecked={choice === 'none'}
                />
                {t(`domainChoices.${choice}`)}
              </label>
            ))}
          </div>
          <div className={styles.domainName}>
            <DomainField
              id="domainName"
              name="domainName"
              label={t('domainName')}
              hint={t('domainNameHint')}
              labels={{
                check: t('domainCheck'),
                checking: t('domainChecking'),
                free: t('domainFree'),
                taken: t('domainTaken'),
                unknown: t('domainUnknown'),
                use: t('domainUse'),
                invalid: t('domainInvalid'),
                failed: t('domainFailed'),
              }}
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t('contactTitle')}</legend>
          <div className={styles.row}>
            <FormInput
              id="name"
              name="name"
              label={t('name')}
              autoComplete="name"
              required
              maxLength={120}
            />
            <FormInput
              id="email"
              name="email"
              type="email"
              label={t('email')}
              autoComplete="email"
              required
              maxLength={254}
            />
          </div>
          <p className={styles.hint}>{t('photosNote')}</p>
        </fieldset>

        {/* Honeypot: hidden from people and assistive tech, tempting for bots. */}
        <div className="visually-hidden" aria-hidden="true">
          <label htmlFor="request-website">Website</label>
          <input id="request-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {legalOwner ? (
          <p className={styles.hint}>
            {t.rich('privacyNote', { link: (chunks) => <Link href="/privacy">{chunks}</Link> })}
          </p>
        ) : null}
        <div>
          <SubmitButton pendingLabel={t('sending')}>{t('submit')}</SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
