import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import styles from '../videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };
type Section = { title: string; body: string };

/** The rules people accept before entering (version VIDEOCHAT_TERMS_VERSION in the API). */
export default async function VideochatRulesPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Videochat.rules' });
  const sections = t.raw('sections') as Section[];

  return (
    <article className={styles.rules}>
      <h1 className={styles.pageTitle}>{t('title')}</h1>
      <p className={styles.muted}>{t('updated')}</p>
      <p>{t('intro')}</p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
          <p>{section.body}</p>
        </section>
      ))}
    </article>
  );
}
