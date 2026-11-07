import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import fieldStyles from '@/components/ui/Field.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { adminGetCalculator } from '@/lib/api/calculator';
import { CALCULATOR_EXTRAS, CALCULATOR_SIZES, CALCULATOR_TYPES } from '@/lib/calculator';
import { saveCalculatorAction } from './actions';
import calc from './calculator.module.css';

/** A number input for a table cell, labelled for screen readers. */
function Cell({
  name,
  label,
  value,
  step,
}: {
  name: string;
  label: string;
  value: number;
  step?: string;
}) {
  return (
    <input
      name={name}
      type="number"
      min={0}
      step={step ?? '1'}
      inputMode="decimal"
      aria-label={label}
      defaultValue={value}
      className={`${fieldStyles.control} ${calc.cell}`}
    />
  );
}

export default async function AdminCalculatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.calculator' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tt = await getTranslations({ locale, namespace: 'Contact.projectTypes' });
  const tk = await getTranslations({ locale, namespace: 'Calculator' });
  const config = await adminGetCalculator();

  return (
    <>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          config.enabled ? (
            <Button href="/calculator" variant="outline" size="sm">
              {t('view')}
            </Button>
          ) : undefined
        }
      />
      <section className={styles.panel}>
        <ActionForm action={saveCalculatorAction.bind(null, locale)} className={styles.form}>
          <h2 className={styles.panelTitle}>{t('typesTitle')}</h2>
          <p className={styles.muted}>{t('typesLead')}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('type')}</th>
                  <th scope="col">{t('min')}</th>
                  <th scope="col">{t('max')}</th>
                  <th scope="col">{t('weeksMin')}</th>
                  <th scope="col">{t('weeksMax')}</th>
                </tr>
              </thead>
              <tbody>
                {CALCULATOR_TYPES.map((key) => (
                  <tr key={key}>
                    <th scope="row">{tt(key)}</th>
                    <td>
                      <Cell
                        name={`${key}.min`}
                        label={`${tt(key)}: ${t('min')}`}
                        value={config.types[key].min}
                      />
                    </td>
                    <td>
                      <Cell
                        name={`${key}.max`}
                        label={`${tt(key)}: ${t('max')}`}
                        value={config.types[key].max}
                      />
                    </td>
                    <td>
                      <Cell
                        name={`${key}.weeksMin`}
                        label={`${tt(key)}: ${t('weeksMin')}`}
                        value={config.types[key].weeksMin}
                      />
                    </td>
                    <td>
                      <Cell
                        name={`${key}.weeksMax`}
                        label={`${tt(key)}: ${t('weeksMax')}`}
                        value={config.types[key].weeksMax}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className={styles.panelTitle}>{t('sizesTitle')}</h2>
          <p className={styles.muted}>{t('sizesLead')}</p>
          <div className={calc.sizes}>
            {CALCULATOR_SIZES.map((key) => (
              <div key={key} className={calc.size}>
                <span>
                  <strong>{tk(`sizes.${key}.label`)}</strong>
                  <small>{tk(`sizes.${key}.hint`)}</small>
                </span>
                <Cell
                  name={`size.${key}`}
                  label={tk(`sizes.${key}.label`)}
                  value={config.sizes[key]}
                  step="0.1"
                />
              </div>
            ))}
          </div>

          <h2 className={styles.panelTitle}>{t('extrasTitle')}</h2>
          <p className={styles.muted}>{t('extrasLead')}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('extra')}</th>
                  <th scope="col">{t('min')}</th>
                  <th scope="col">{t('max')}</th>
                </tr>
              </thead>
              <tbody>
                {CALCULATOR_EXTRAS.map((key) => (
                  <tr key={key}>
                    <th scope="row">{tk(`extras.${key}`)}</th>
                    <td>
                      <Cell
                        name={`extra.${key}.min`}
                        label={`${tk(`extras.${key}`)}: ${t('min')}`}
                        value={config.extras[key].min}
                      />
                    </td>
                    <td>
                      <Cell
                        name={`extra.${key}.max`}
                        label={`${tk(`extras.${key}`)}: ${t('max')}`}
                        value={config.extras[key].max}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <FormCheckbox
            name="enabled"
            label={t('enabled')}
            hint={t('enabledHint')}
            defaultChecked={config.enabled}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
