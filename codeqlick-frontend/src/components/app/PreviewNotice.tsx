import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import styles from './app.module.css';

/** Which translation a preview shows: the requested one when it exists, otherwise English. */
export function previewLanguage<T extends { locale: AppLocale }>(
  translations: T[],
  requested: string | string[] | undefined,
  fallback: AppLocale,
): T | undefined {
  const wanted = typeof requested === 'string' ? requested : fallback;
  return (
    translations.find((item) => item.locale === wanted) ??
    translations.find((item) => item.locale === routing.defaultLocale)
  );
}

/** Banner above an admin preview: what is shown, plus links to the other saved translations. */
export async function PreviewNotice({
  locale,
  basePath,
  shown,
  available,
  published,
}: {
  locale: AppLocale;
  /** Locale-less path of the preview page, e.g. `/admin/posts/<id>/preview`. */
  basePath: string;
  shown: AppLocale;
  available: AppLocale[];
  published: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.preview' });
  const tl = await getTranslations({ locale, namespace: 'LocaleSwitcher' });

  return (
    <Alert tone="info">
      <p>
        {t(published ? 'noticePublished' : 'noticeDraft', { language: tl(shown) })} {t('unsaved')}
      </p>
      {available.length > 1 ? (
        <p className={styles.muted}>
          {t('otherLanguages')}{' '}
          {available
            .filter((language) => language !== shown)
            .map((language) => (
              <Link key={language} href={`${basePath}?lang=${language}`}>
                {tl(language)}
              </Link>
            ))}
        </p>
      ) : null}
    </Alert>
  );
}
