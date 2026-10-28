import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { SITE_PRESETS, type SiteRequest } from '@/lib/api/types';
import { FormInput, FormSelect, FormTextarea } from './ActionForm';
import styles from './app.module.css';

/**
 * A basic-website request's fields for the team (a prospect's preview, or editing a lead's
 * request): the names `siteRequestFieldsSchema` parses, with `request`'s values.
 */
export async function SiteRequestFields({
  locale,
  request,
}: {
  locale: AppLocale;
  request?: SiteRequest | null;
}) {
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  const tw = await getTranslations({ locale, namespace: 'BasicWebsite' });
  const tk = (key: string) => tw(key as never);
  const b = request?.business;
  const domainChoice = request?.domain ? (request.domain.owned ? 'owned' : 'new') : 'none';

  return (
    <div className={styles.form}>
      <FormSelect
        name="preset"
        label={t('styleTitle')}
        options={SITE_PRESETS.map((key) => ({
          value: key,
          label: `${tk(`demos.${key}.name`)} — ${tk(`demos.${key}.kind`)}`,
        }))}
        defaultValue={request?.preset ?? 'general'}
      />
      <div className={styles.row}>
        <FormInput
          id="businessName"
          name="businessName"
          label={t('businessName')}
          defaultValue={b?.name}
          required
          maxLength={80}
        />
        <FormInput
          id="kind"
          name="kind"
          label={t('kind')}
          placeholder={t('kindPlaceholder')}
          defaultValue={b?.kind}
          required
          maxLength={80}
        />
      </div>
      <div className={styles.row}>
        <FormInput
          id="city"
          name="city"
          label={t('city')}
          defaultValue={b?.city}
          required
          maxLength={80}
        />
        <FormInput
          id="address"
          name="address"
          label={t('address')}
          placeholder={t('addressPlaceholder')}
          defaultValue={b?.address}
          maxLength={160}
        />
      </div>
      <div className={styles.row}>
        <FormInput
          id="phone"
          name="phone"
          type="tel"
          label={t('phone')}
          defaultValue={b?.phone}
          maxLength={30}
        />
        <FormInput
          id="whatsapp"
          name="whatsapp"
          type="tel"
          label={t('whatsapp')}
          defaultValue={b?.whatsapp}
          maxLength={30}
        />
        <FormInput
          id="businessEmail"
          name="businessEmail"
          type="email"
          label={t('businessEmail')}
          defaultValue={b?.email}
          maxLength={254}
        />
      </div>
      <FormTextarea
        id="hours"
        name="hours"
        label={t('hours')}
        hint={t('hoursHint')}
        placeholder={t('hoursPlaceholder')}
        defaultValue={b?.hours}
        rows={3}
        maxLength={1000}
      />
      <FormTextarea
        id="services"
        name="services"
        label={t('services')}
        hint={t('servicesHint')}
        placeholder={t('servicesPlaceholder')}
        defaultValue={b?.services}
        rows={5}
        maxLength={3000}
      />
      <FormTextarea
        id="about"
        name="about"
        label={t('about')}
        defaultValue={b?.about}
        rows={4}
        maxLength={3000}
      />
      <FormTextarea
        id="wishes"
        name="wishes"
        label={t('wishes')}
        defaultValue={b?.wishes}
        rows={3}
        maxLength={3000}
      />
      <div className={styles.row}>
        <FormSelect
          name="domainChoice"
          label={t('domainTitle')}
          options={(['new', 'owned', 'none'] as const).map((choice) => ({
            value: choice,
            label: t(`domainChoices.${choice}`),
          }))}
          defaultValue={domainChoice}
        />
        <FormInput
          id="domainName"
          name="domainName"
          label={t('domainName')}
          defaultValue={request?.domain?.name}
          maxLength={253}
        />
      </div>
    </div>
  );
}
