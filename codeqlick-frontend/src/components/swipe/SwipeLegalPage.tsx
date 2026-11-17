import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import adult from '@/components/adult/adult.module.css';
import { Markdown } from '@/components/markdown/Markdown';
import { type LegalOwner } from '@/content/legal';
import { swipeLegalDocument, type SwipeLegalPage } from '@/content/legal/swipe';
import { resolveLocale } from '@/i18n/locale';
import { neoqlickLegalOwner } from '@/lib/env';

type PageProps = { params: Promise<{ locale: string }> };

/** Until a legal holder is set (NEOQLICK_LEGAL_OWNER_NAME or LEGAL_OWNER_NAME) the texts name Neoqlick; they're never indexed (adult app). */
function owner(): LegalOwner {
  return neoqlickLegalOwner ?? { name: 'Neoqlick' };
}

export function legalMetadata(page: SwipeLegalPage) {
  return async ({ params }: PageProps): Promise<Metadata> => {
    const locale = resolveLocale((await params).locale);
    const { title, description } = swipeLegalDocument(page, owner(), locale);
    return { title: { absolute: title }, description, robots: { index: false, follow: false } };
  };
}

/** Swipe's terms of use or privacy policy (architecture 4.10), inside Swipe's own frame. */
export function legalPage(page: SwipeLegalPage) {
  return async function SwipeLegal({ params }: PageProps) {
    const locale = resolveLocale((await params).locale);
    setRequestLocale(locale);
    const t = await getTranslations({ locale, namespace: 'Legal' });
    const tm = await getTranslations({ locale, namespace: 'Markdown' });
    const document = swipeLegalDocument(page, owner(), locale);
    return (
      <article className={adult.rules}>
        <h1 className={adult.pageTitle}>{document.title}</h1>
        <p className={adult.muted}>{t('updated', { date: document.updated })}</p>
        <Markdown anchors={{ linkLabel: tm('anchorLink') }}>{document.markdown}</Markdown>
      </article>
    );
  };
}
