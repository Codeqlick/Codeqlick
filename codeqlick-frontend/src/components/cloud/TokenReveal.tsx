'use client';

import { useTranslations } from 'next-intl';
import { useFormState } from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';

/** Inside the "create token" form: the new token (shown once, only its hash is kept), to copy. */
export function TokenReveal() {
  const t = useTranslations('Cloud.common');
  const token = useFormState().values?.token;
  if (!token) return null;
  return <CopyLink url={token} labels={{ copy: t('copy'), copied: t('copied') }} />;
}
