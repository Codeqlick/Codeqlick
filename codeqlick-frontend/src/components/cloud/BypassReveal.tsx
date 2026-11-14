'use client';

import { useTranslations } from 'next-intl';
import { useFormState } from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { bypassHeaderLine } from '@/lib/cloud';
import styles from '@/app/[locale]/cloud/cloud.module.css';

/**
 * Inside the "generate bypass token" form: the new token (shown once, only its hash is kept), the
 * header line that sends it and a Playwright and a curl example.
 */
export function BypassReveal() {
  const t = useTranslations('Cloud.protection.bypass');
  const tc = useTranslations('Cloud.common');
  const token = useFormState().values?.token;
  if (!token) return null;
  const labels = { copy: tc('copy'), copied: tc('copied') };
  return (
    <div className={styles.stack}>
      <p className={styles.small}>
        <strong>{t('shownOnce')}</strong>
      </p>
      <CopyLink url={token} labels={labels} />
      <p className={styles.small}>{t('headerLabel')}</p>
      <CopyLink url={bypassHeaderLine(token)} labels={labels} />
      <details>
        <summary className={styles.small}>{t('examples')}</summary>
        <p className={styles.small}>{t('playwright')}</p>
        <pre className={styles.value}>
          {`use: { extraHTTPHeaders: { 'X-Codeqlick-Bypass': process.env.CQ_BYPASS } }`}
        </pre>
        <p className={styles.small}>{t('curl')}</p>
        <pre className={styles.value}>{`curl -H "X-Codeqlick-Bypass: $CQ_BYPASS" https://…`}</pre>
      </details>
    </div>
  );
}
