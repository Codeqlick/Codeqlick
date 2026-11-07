import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { BRIEF_SECTIONS, type ProjectBrief } from '@/lib/brief';
import { formatDate } from '@/lib/format';
import styles from './app.module.css';
import summary from './BriefSummary.module.css';

/** The brief's answers by section, as the team reads them; unanswered questions are left out. */
export async function BriefSummary({ brief, locale }: { brief: ProjectBrief; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Brief' });
  // Keys built from the question list (lib/brief.ts), all present in the Brief messages.
  const tk = (key: string) => t(key as never);
  const sections = BRIEF_SECTIONS.map((section) => ({
    ...section,
    fields: section.fields.filter((field) => brief.answers[field.key]),
  })).filter((section) => section.fields.length > 0);
  if (sections.length === 0) return <p className={styles.muted}>{t('empty')}</p>;

  return (
    <div className={styles.stack}>
      {sections.map((section) => (
        <div key={section.key}>
          <h3 className={styles.updateTitle}>{tk(`sections.${section.key}.title`)}</h3>
          <dl className={summary.answers}>
            {section.fields.map((field) => {
              const value = brief.answers[field.key] ?? '';
              const shown =
                field.kind === 'select'
                  ? tk(`options.${field.key}.${value}`)
                  : field.kind === 'date'
                    ? formatDate(value, locale)
                    : value;
              return (
                <div key={field.key}>
                  <dt>{tk(`fields.${field.key}.label`)}</dt>
                  <dd>
                    {field.kind === 'url' ? (
                      <a href={value} target="_blank" rel="noopener noreferrer">
                        {value}
                      </a>
                    ) : (
                      shown
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}
