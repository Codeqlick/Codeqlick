import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { MarkdownPreviewLabels } from './MarkdownField';

/** Translated labels of MarkdownField's preview, for Server Component forms. */
export async function markdownPreviewLabels(locale: AppLocale): Promise<MarkdownPreviewLabels> {
  const t = await getTranslations({ locale, namespace: 'Admin.markdownPreview' });
  return { show: t('show'), hide: t('hide'), title: t('title'), empty: t('empty') };
}
