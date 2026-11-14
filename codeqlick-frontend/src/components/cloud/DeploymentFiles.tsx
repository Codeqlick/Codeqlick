'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { FILE_ROWS_STEP, filterFiles } from '@/lib/cloud';
import { FileTable } from './FileTable';
import styles from './DeploymentFiles.module.css';

/**
 * A deployment's Files tab: every file (path and size) with a filter box. The list (at most
 * 10,000 files) comes from the server once; filtering happens here, and only the first
 * FILE_ROWS_STEP matches are rendered, with "Show more" adding that many again.
 */
export function DeploymentFiles({
  items,
  locale,
}: {
  items: ReadonlyArray<{ path: string; size: number }>;
  locale: string;
}) {
  const t = useTranslations('Cloud.deployment');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(FILE_ROWS_STEP);
  const deferredQuery = useDeferredValue(query);
  const matched = useMemo(() => filterFiles(items, deferredQuery), [items, deferredQuery]);
  const shown = matched.length > limit ? matched.slice(0, limit) : matched;
  const filtering = deferredQuery.trim() !== '';
  const left = matched.length - shown.length;

  return (
    <div className={styles.files}>
      <Input
        id="deployment-files-filter"
        type="search"
        label={t('filter')}
        hint={t('filterHint')}
        className={styles.filter}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setLimit(FILE_ROWS_STEP);
        }}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={200}
        mono
      />
      <output className={styles.status}>
        {filtering ? t('matches', { count: matched.length }) : null}
        {filtering && left > 0 ? ' ' : null}
        {left > 0 ? t('showing', { shown: shown.length, count: matched.length }) : null}
      </output>
      {shown.length > 0 ? (
        <FileTable
          items={shown}
          locale={locale}
          caption={t('filesCaption')}
          labels={{ path: t('path'), size: t('size') }}
        />
      ) : null}
      {left > 0 ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((current) => current + FILE_ROWS_STEP)}
          >
            {t('showMore', { count: Math.min(FILE_ROWS_STEP, left) })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
