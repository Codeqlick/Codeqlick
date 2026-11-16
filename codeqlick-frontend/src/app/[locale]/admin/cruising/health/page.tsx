import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { resolveLocale } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import { listAdminHealthCenters } from '@/lib/api/cruising-safety';
import { SWIPE_COUNTRIES } from '@/lib/countries';
import { countryName, osmLink } from '@/lib/cruising';
import type { HealthCenter } from '@/lib/cruising-safety';
import { firstParam } from '@/lib/format';
import admin from '../cruising-admin.module.css';
import { SpotImport } from '../SpotImport';
import {
  createCenterAction,
  deleteCenterAction,
  importCentersAction,
  updateCenterAction,
} from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

type FieldsT = Awaited<ReturnType<typeof getTranslations<'AdminCruisingHealth'>>>;

/** The fields of a centre, empty (to add one) or filled in (to correct it). */
function CenterFields({
  t,
  prefix,
  countries,
  center,
}: {
  t: FieldsT;
  prefix: string;
  countries: { value: string; label: string }[];
  center?: HealthCenter;
}) {
  return (
    <>
      <FormInput
        id={`${prefix}-name`}
        name="name"
        label={t('name')}
        defaultValue={center?.name}
        maxLength={120}
        required
      />
      <FormInput
        id={`${prefix}-address`}
        name="address"
        label={t('address')}
        defaultValue={center?.address}
        maxLength={200}
        required
      />
      <div className={styles.row}>
        <FormInput
          id={`${prefix}-lat`}
          name="lat"
          label={t('lat')}
          inputMode="decimal"
          defaultValue={center ? String(center.lat) : undefined}
          required
        />
        <FormInput
          id={`${prefix}-lng`}
          name="lng"
          label={t('lng')}
          inputMode="decimal"
          defaultValue={center ? String(center.lng) : undefined}
          required
        />
      </div>
      <FormSelect
        id={`${prefix}-country`}
        name="countryCode"
        label={t('country')}
        placeholder={t('chooseCountry')}
        options={countries}
        defaultValue={center?.countryCode ?? ''}
        required
      />
      <FormInput
        id={`${prefix}-city`}
        name="city"
        label={t('city')}
        defaultValue={center?.city}
        maxLength={80}
        required
      />
      <FormInput
        id={`${prefix}-url`}
        name="url"
        type="url"
        label={t('url')}
        optionalLabel={t('optional')}
        defaultValue={center?.url ?? undefined}
        maxLength={300}
      />
      <FormInput
        id={`${prefix}-phone`}
        name="phone"
        type="tel"
        label={t('phone')}
        optionalLabel={t('optional')}
        defaultValue={center?.phone ?? undefined}
        maxLength={40}
      />
      <FormCheckbox
        id={`${prefix}-free`}
        name="free"
        label={t('free')}
        defaultChecked={center?.free}
      />
      <FormCheckbox
        id={`${prefix}-anonymous`}
        name="anonymous"
        label={t('anonymous')}
        defaultChecked={center?.anonymous}
      />
      <FormCheckbox
        id={`${prefix}-rapid`}
        name="rapid"
        label={t('rapid')}
        defaultChecked={center?.rapid}
      />
    </>
  );
}

/** Admin → Cruising → Testing centres (decision 94): the public /health page's list. */
export default async function AdminCruisingHealthPage({ params, searchParams }: PageProps) {
  const locale: AppLocale = resolveLocale((await params).locale);
  const q = (firstParam((await searchParams).q) ?? '').trim();
  const t = await getTranslations({ locale, namespace: 'AdminCruisingHealth' });
  const centers = await listAdminHealthCenters(q);
  const countries = SWIPE_COUNTRIES.map((code) => ({
    value: code,
    label: countryName(code, locale),
  })).toSorted((a, b) => a.label.localeCompare(b.label, locale));

  return (
    <>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        back={{ href: '/admin/cruising', label: t('back') }}
      />

      <section className={styles.panel} aria-labelledby="centers-list">
        <h2 id="centers-list" className={styles.panelTitle}>
          {t('listTitle', { count: centers.length })}
        </h2>
        <search>
          <form method="get" className={admin.filters}>
            <FormInput
              id="centers-q"
              name="q"
              type="search"
              label={t('search')}
              defaultValue={q}
              maxLength={100}
            />
            <SubmitButton size="sm" variant="outline">
              {t('searchButton')}
            </SubmitButton>
          </form>
        </search>
        {centers.length === 0 ? (
          <p className={styles.muted}>{t('empty')}</p>
        ) : (
          centers.map((center) => (
            <article key={center.id} className={admin.item}>
              <div className={admin.body}>
                <h3 className={styles.panelTitle}>{center.name}</h3>
                <p className={styles.muted}>{center.address}</p>
                <p>
                  {center.city}, {countryName(center.countryCode, locale)} ·{' '}
                  <a
                    href={osmLink(center.lat, center.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('onMap')}
                  </a>
                </p>
                <p>
                  {[
                    center.free ? t('free') : null,
                    center.anonymous ? t('anonymous') : null,
                    center.rapid ? t('rapid') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className={admin.body}>
                <details className={admin.edit}>
                  <summary>{t('edit')}</summary>
                  <ActionForm
                    action={updateCenterAction.bind(null, locale, center.id)}
                    className={styles.form}
                  >
                    <CenterFields
                      t={t}
                      prefix={`edit-${center.id}`}
                      countries={countries}
                      center={center}
                    />
                    <SubmitButton size="sm" pendingLabel={t('saving')}>
                      {t('save')}
                    </SubmitButton>
                  </ActionForm>
                </details>
                <ActionForm action={deleteCenterAction.bind(null, locale, center.id)}>
                  <SubmitButton size="sm" variant="danger" pendingLabel={t('deleting')}>
                    {t('delete')}
                  </SubmitButton>
                </ActionForm>
              </div>
            </article>
          ))
        )}
      </section>

      <section className={styles.panel} aria-labelledby="centers-add">
        <h2 id="centers-add" className={styles.panelTitle}>
          {t('addTitle')}
        </h2>
        <ActionForm action={createCenterAction.bind(null, locale)} className={styles.form}>
          <CenterFields t={t} prefix="new-center" countries={countries} />
          <SubmitButton pendingLabel={t('adding')}>{t('add')}</SubmitButton>
        </ActionForm>
      </section>

      <section className={styles.panel} aria-labelledby="centers-import">
        <h2 id="centers-import" className={styles.panelTitle}>
          {t('importTitle')}
        </h2>
        <ClientMessages extra={APP_NAMESPACES.admin}>
          <SpotImport action={importCentersAction.bind(null, locale)} kind="health" />
        </ClientMessages>
      </section>
    </>
  );
}
