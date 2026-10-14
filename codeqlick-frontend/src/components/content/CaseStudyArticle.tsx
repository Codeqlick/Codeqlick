import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import styles from '@/app/[locale]/(site)/site.module.css';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { AppLocale } from '@/i18n/routing';

export type CaseStudyContent = {
  title: string;
  summary: string;
  content: string;
  clientName: string | null;
  projectUrl: string | null;
  coverImageUrl: string | null;
  technologies: string[];
};

/** A case study as visitors see it. Shared by the public page and the admin preview. */
export async function CaseStudyArticle({
  item,
  locale,
  children,
}: {
  item: CaseStudyContent;
  locale: AppLocale;
  /** Rendered first inside the article (back link). */
  children?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'Work' });

  return (
    <article className={`wrap ${styles.page} ${styles.narrow}`}>
      {children}
      <h1 className={styles.title}>{item.title}</h1>
      <p className={`lead ${styles.lead}`}>{item.summary}</p>

      <dl className={styles.facts}>
        {item.clientName ? (
          <div>
            <dt>{t('client')}</dt>
            <dd>{item.clientName}</dd>
          </div>
        ) : null}
        {item.technologies.length > 0 ? (
          <div>
            <dt>{t('technologies')}</dt>
            <dd>
              <ul className={styles.tags}>
                {item.technologies.map((name) => (
                  <li key={name}>
                    <Badge>{name}</Badge>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>

      {item.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
        <img src={item.coverImageUrl} alt="" className={`${styles.cover} ${styles.hero}`} />
      ) : null}
      <div className={styles.content}>
        <Markdown>{item.content}</Markdown>
      </div>
      {item.projectUrl ? (
        <div className={styles.actions}>
          <Button href={item.projectUrl} external target="_blank" rel="noopener noreferrer">
            {t('visit')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
