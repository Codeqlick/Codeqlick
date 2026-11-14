import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import { Markdown } from '@/components/markdown/Markdown';
import { type LegalOwner } from '@/content/legal';
import { swipeLegalDocument, type SwipeLegalPage } from '@/content/legal/swipe';
import { resolveLocale } from '@/i18n/locale';
import { legalOwner } from '@/lib/env';
import { SITE_NAME } from '@/lib/site';

type PageProps = { params: Promise<{ locale: string }> };

/** Until LEGAL_OWNER_NAME is set the texts name the studio; they're never indexed (adult app). */
function owner(): LegalOwner {
  return legalOwner ?? { name: SITE_NAME };
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
      <article className={vc.rules}>
        <h1 className={vc.pageTitle}>{document.title}</h1>
        <p className={vc.muted}>{t('updated', { date: document.updated })}</p>
        <Markdown anchors={{ linkLabel: tm('anchorLink') }}>{document.markdown}</Markdown>
      </article>
    );
  };
}
