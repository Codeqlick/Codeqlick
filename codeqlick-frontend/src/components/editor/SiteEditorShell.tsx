'use client';

import { useState, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import type { SiteNewsList } from '@/lib/api/types';
import { SiteEditor } from './SiteEditor';
import { SiteNews } from './SiteNews';
import { TabList } from '@/components/ui/TabList';
import styles from './SiteEditor.module.css';

/**
 * The website editor with its "Noticias" tab (architecture 8.2). News are not part of the site's
 * draft, so they live beside the editor, not in it: the editor stays mounted (its draft, preview
 * and autosave keep going) while the news are shown.
 */
export function SiteEditorShell({
  news,
  ...editor
}: ComponentProps<typeof SiteEditor> & {
  /** The news section's switch and first posts (their own save buttons, not the draft's). */
  news: SiteNewsList | null;
}) {
  const t = useTranslations('SiteNews');
  const [section, setSection] = useState<'site' | 'news'>('site');
  return (
    <>
      {news ? (
        <TabList
          label={t('tabsLabel')}
          value={section}
          onChange={setSection}
          items={[
            { value: 'site', label: t('tabSite'), controls: 'site-editor-site' },
            { value: 'news', label: t('tabNews'), controls: 'site-editor-news' },
          ]}
        />
      ) : null}
      {news && section === 'news' ? (
        <div id="site-editor-news">
          <SiteNews
            locale={editor.locale}
            scope="portal"
            projectId={editor.projectId}
            initial={news}
            english={
              editor.initial.content.english === true ||
              editor.initial.published.content.english === true
            }
          />
        </div>
      ) : null}
      <div
        id="site-editor-site"
        hidden={Boolean(news) && section === 'news'}
        className={styles.siteSection}
      >
        <SiteEditor {...editor} />
      </div>
    </>
  );
}
