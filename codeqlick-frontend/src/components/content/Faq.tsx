import { getTranslations } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import type { AppLocale } from '@/i18n/routing';
import styles from './Faq.module.css';

/** Questions in messages (Faq.items), in the order they are usually asked. */
export const FAQ_KEYS = [
  'start',
  'cost',
  'time',
  'progress',
  'changes',
  'maintenance',
  'ownership',
  'response',
  'nda',
] as const;
/** Questions of the basic-website page. */
export const BASIC_FAQ_KEYS = ['basicTime', 'basicContent', 'basicChanges', 'basicDomain'] as const;
export type FaqKey = (typeof FAQ_KEYS)[number] | (typeof BASIC_FAQ_KEYS)[number];

/**
 * Frequently asked questions as disclosure widgets (no script), with FAQPage structured data so
 * search engines can show them. `keys` picks and orders the questions for each page.
 */
export async function Faq({
  locale,
  keys = FAQ_KEYS,
  headingId = 'faq-title',
  title,
}: {
  locale: AppLocale;
  keys?: readonly FaqKey[];
  headingId?: string;
  /** Replaces the default heading. */
  title?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Faq' });
  const items = keys.map((key) => ({
    key,
    question: t(`items.${key}.q`),
    answer: t(`items.${key}.a`),
  }));

  return (
    <section className={styles.faq} aria-labelledby={headingId}>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: items.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        }}
      />
      <p className="eyebrow">{t('eyebrow')}</p>
      <h2 id={headingId} className={styles.title}>
        {title ?? t('title')}
      </h2>
      <div className={styles.list}>
        {items.map((item) => (
          <details key={item.key} className={styles.item}>
            <summary className={styles.question}>{item.question}</summary>
            <p className={styles.answer}>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
