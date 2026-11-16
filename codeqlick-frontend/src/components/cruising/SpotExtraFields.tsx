import { getTranslations } from 'next-intl/server';
import { FormCheckboxGroup, FormInput, FormTextarea } from '@/components/app/ActionForm';
import type { AppLocale } from '@/i18n/routing';
import { LIMITS, SPOT_TAGS, TAGS_FIELD } from '@/lib/cruising';
import styles from './Cruising.module.css';

type SpotExtraFieldsProps = {
  locale: AppLocale;
  /** Keeps ids unique when several forms on a page show these fields (the team's lists). */
  idPrefix?: string;
  defaults?: { tags?: readonly string[]; openingHours?: string | null; tips?: string | null };
};

/**
 * The structured information of a spot (decision 92): its tags, opening hours and tips. Shared by
 * the proposal, the proposer's edit, the team's correction and the team's one-spot form.
 */
export async function SpotExtraFields({ locale, idPrefix, defaults = {} }: SpotExtraFieldsProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.spotForm' });
  const tg = await getTranslations({ locale, namespace: 'Cruising.tags' });
  const id = (name: string) => (idPrefix ? `${idPrefix}-${name}` : undefined);
  return (
    <>
      {/* Says the tags were on the form: none ticked then means "no tags". */}
      <input type="hidden" name={TAGS_FIELD} value="1" />
      <FormCheckboxGroup
        name="tags"
        idPrefix={id('tags')}
        legend={t('tags')}
        options={SPOT_TAGS.map((value) => ({ value, label: tg(value) }))}
        defaultValues={[...(defaults.tags ?? [])]}
        className={styles.tagChoices}
      />
      <FormInput
        id={id('openingHours')}
        name="openingHours"
        label={t('openingHours')}
        hint={t('openingHoursHint')}
        maxLength={LIMITS.openingHours}
        defaultValue={defaults.openingHours ?? ''}
        optionalLabel={t('optional')}
      />
      <FormTextarea
        id={id('tips')}
        name="tips"
        label={t('tips')}
        hint={t('tipsHint')}
        rows={3}
        maxLength={LIMITS.tips}
        defaultValue={defaults.tips ?? ''}
        optionalLabel={t('optional')}
      />
    </>
  );
}
