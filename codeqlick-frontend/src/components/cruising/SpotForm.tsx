import { getTranslations } from 'next-intl/server';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import {
  ActionForm,
  FormInput,
  FormSelect,
  FormTextarea,
  type FormAction,
} from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { SWIPE_COUNTRIES } from '@/lib/countries';
import { countryName, LIMITS, SPOT_TYPES } from '@/lib/cruising';
import { SpotExtraFields } from './SpotExtraFields';

type SpotFormProps = {
  locale: AppLocale;
  action: FormAction;
  /** What the fields start with: a link's coordinates, or the spot being edited. */
  defaults?: Partial<
    Record<
      'name' | 'type' | 'lat' | 'lng' | 'countryCode' | 'city' | 'description' | 'bestTimes',
      string
    >
  >;
  mode: 'create' | 'edit';
  /** Phase 5 (decision 92): the spot's tags, opening hours and tips being edited. */
  extras?: { tags?: readonly string[]; openingHours?: string | null; tips?: string | null };
};

/** The form to propose a spot, or to edit one that is waiting or was rejected. */
export async function SpotForm({ locale, action, defaults = {}, mode, extras }: SpotFormProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.spotForm' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const countries = SWIPE_COUNTRIES.map((code) => ({
    value: code,
    label: countryName(code, locale),
  })).toSorted((a, b) => a.label.localeCompare(b.label, locale));

  return (
    <ActionForm action={action} className={vc.form}>
      <input type="hidden" name="locale" value={locale} />
      <div className={vc.warning} role="note">
        <strong>{t('safetyTitle')}.</strong> {t('safety')}{' '}
        <Link href="/cruising/rules" target="_blank" className={vc.inlineLink}>
          {t('rulesLink')}
        </Link>
      </div>
      <FormInput
        name="name"
        label={t('name')}
        hint={t('nameHint')}
        maxLength={LIMITS.name}
        defaultValue={defaults.name}
        required
      />
      <FormSelect
        name="type"
        label={t('type')}
        placeholder={t('typePlaceholder')}
        options={SPOT_TYPES.map((value) => ({ value, label: tt(value) }))}
        defaultValue={defaults.type ?? ''}
        required
      />
      <FormInput
        name="lat"
        label={t('lat')}
        hint={t('latHint')}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaults.lat}
        required={mode === 'create'}
      />
      <FormInput
        name="lng"
        label={t('lng')}
        hint={t('lngHint')}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaults.lng}
        required={mode === 'create'}
      />
      <p className={vc.hint}>
        <Link href="/cruising/map" className={vc.inlineLink}>
          {t('chooseOnMap')}
        </Link>
      </p>
      <FormSelect
        name="countryCode"
        label={t('country')}
        placeholder={t('countryPlaceholder')}
        options={countries}
        defaultValue={defaults.countryCode ?? ''}
        required
      />
      <FormInput
        name="city"
        label={t('city')}
        maxLength={LIMITS.city}
        defaultValue={defaults.city}
        required
      />
      <FormTextarea
        name="description"
        label={t('description')}
        hint={t('descriptionHint')}
        rows={6}
        maxLength={LIMITS.description}
        defaultValue={defaults.description}
        required
      />
      <FormInput
        name="bestTimes"
        label={t('bestTimes')}
        hint={t('bestTimesHint')}
        maxLength={LIMITS.bestTimes}
        defaultValue={defaults.bestTimes}
        optionalLabel={t('optional')}
      />
      <SpotExtraFields locale={locale} defaults={extras} />
      {mode === 'edit' ? (
        <p className={vc.hint}>{t('editNote')}</p>
      ) : (
        <p className={vc.hint}>{t('reviewNote')}</p>
      )}
      <SubmitButton block pendingLabel={t('sending')}>
        {mode === 'edit' ? t('saveEdit') : t('submit')}
      </SubmitButton>
    </ActionForm>
  );
}
