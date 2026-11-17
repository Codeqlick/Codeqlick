import { useTranslations } from 'next-intl';
import {
  ActionForm,
  FormCheckboxGroup,
  FormInput,
  FormTextarea,
} from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { ConfirmSubmitButton } from '@/components/cloud/ConfirmSubmitButton';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { CloudBucket } from '@/lib/api/cloud';
import { CORS_METHODS } from '@/lib/cloud';
import { saveBucketCorsAction, setBucketPublicAction } from '../../../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  path: string;
  projectId: string;
  bucket: Pick<CloudBucket, 'id' | 'name' | 'public' | 'publicUrl' | 'cors'>;
  admin: boolean;
  /** The project's public buckets and its plan's limit. */
  publicCount: number;
  publicLimit: number;
};

/**
 * A bucket's public read and CORS rule (architecture 4.13 "Object storage", decision 111): admins
 * change them (public read after a confirmation), members see them.
 */
export function BucketAccess({
  locale,
  path,
  projectId,
  bucket,
  admin,
  publicCount,
  publicLimit,
}: Props) {
  const t = useTranslations('Cloud.storage');
  const tc = useTranslations('Cloud.common');
  const tg = useTranslations('Common');
  const cors = bucket.cors;
  return (
    <div className={styles.stack}>
      {bucket.public ? (
        <div className={styles.stack}>
          <p className={styles.rowTitle}>
            <Badge tone="warning">{t('public.badge')}</Badge>
            <span className={styles.small}>{t('public.warning')}</span>
          </p>
          {bucket.publicUrl ? (
            <CopyLink url={bucket.publicUrl} labels={{ copy: tc('copy'), copied: tc('copied') }} />
          ) : null}
        </div>
      ) : null}

      {admin ? (
        <ActionForm
          action={setBucketPublicAction.bind(
            null,
            locale,
            path,
            projectId,
            bucket.id,
            !bucket.public,
          )}
          className={styles.form}
        >
          <div className={appUi.actions}>
            <span className={styles.small}>
              {t('public.label')}:{' '}
              <strong>{bucket.public ? t('public.on') : t('public.off')}</strong>
            </span>
            <ConfirmSubmitButton
              pressed={bucket.public}
              confirm={bucket.public ? undefined : t('public.confirm', { name: bucket.name })}
              pendingLabel={tg('saving')}
            >
              {bucket.public ? t('public.turnOff') : t('public.turnOn')}
              <span className="visually-hidden"> — {bucket.name}</span>
            </ConfirmSubmitButton>
            <span className={styles.small}>
              {t('public.count', { count: publicCount, limit: publicLimit })}
            </span>
          </div>
        </ActionForm>
      ) : (
        <p className={styles.small}>
          {t('public.label')}: <strong>{bucket.public ? t('public.on') : t('public.off')}</strong>
        </p>
      )}

      <details>
        <summary className={styles.small}>
          {t('cors.title')}
          {': '}
          {cors ? t('cors.summary', { origins: cors.origins.join(', ') }) : t('cors.none')}
        </summary>
        {cors ? (
          <dl className={styles.small}>
            <dt>{t('cors.origins')}</dt>
            <dd className={styles.mono}>{cors.origins.join(', ')}</dd>
            <dt>{t('cors.methods')}</dt>
            <dd className={styles.mono}>{cors.methods.join(', ')}</dd>
            <dt>{t('cors.headers')}</dt>
            <dd className={styles.mono}>{cors.headers.join(', ')}</dd>
            <dt>{t('cors.exposeHeaders')}</dt>
            <dd className={styles.mono}>{cors.exposeHeaders.join(', ')}</dd>
            <dt>{t('cors.maxAge')}</dt>
            <dd>{t('cors.seconds', { count: cors.maxAge })}</dd>
          </dl>
        ) : null}
        {admin ? (
          <ActionForm
            action={saveBucketCorsAction.bind(null, locale, path, projectId, bucket.id)}
            className={styles.form}
          >
            <p className={styles.small}>{t('cors.lead')}</p>
            <FormTextarea
              id={`${bucket.id}-cors-origins`}
              name="origins"
              label={t('cors.origins')}
              hint={t('cors.originsHint')}
              defaultValue={cors?.origins.join('\n') ?? ''}
              rows={3}
              spellCheck={false}
              autoCapitalize="none"
              mono
            />
            <FormCheckboxGroup
              name="methods"
              idPrefix={`${bucket.id}-cors-methods`}
              legend={t('cors.methods')}
              options={CORS_METHODS.map((method) => ({ value: method, label: method }))}
              defaultValues={cors?.methods ?? ['GET', 'HEAD']}
              className={styles.fieldset}
            />
            <FormInput
              id={`${bucket.id}-cors-headers`}
              name="headers"
              label={t('cors.headers')}
              hint={t('cors.headersHint')}
              defaultValue={cors?.headers.join(', ') ?? ''}
              spellCheck={false}
              autoCapitalize="none"
              mono
            />
            <FormInput
              id={`${bucket.id}-cors-expose`}
              name="exposeHeaders"
              label={t('cors.exposeHeaders')}
              hint={t('cors.exposeHeadersHint')}
              defaultValue={cors?.exposeHeaders.join(', ') ?? ''}
              spellCheck={false}
              autoCapitalize="none"
              mono
            />
            <FormInput
              id={`${bucket.id}-cors-max-age`}
              name="maxAge"
              type="number"
              min={0}
              max={86400}
              label={t('cors.maxAge')}
              hint={t('cors.maxAgeHint')}
              defaultValue={cors ? String(cors.maxAge) : ''}
            />
            <div className={appUi.actions}>
              <SubmitButton size="sm" name="intent" value="save" pendingLabel={tg('saving')}>
                {t('cors.save')}
              </SubmitButton>
              {cors ? (
                <SubmitButton size="sm" variant="ghost" name="intent" value="clear">
                  {t('cors.clear')}
                </SubmitButton>
              ) : null}
            </div>
          </ActionForm>
        ) : null}
      </details>
    </div>
  );
}
