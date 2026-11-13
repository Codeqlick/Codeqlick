import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { TokenReveal } from '@/components/cloud/TokenReveal';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { listCloudBuckets } from '@/lib/api/cloud';
import { formatBytes, formatWhen } from '@/lib/cloud';
import {
  createBucketAction,
  createBucketKeyAction,
  deleteBucketAction,
  deleteBucketKeyAction,
} from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  projectId: string;
  path: string;
  admin: boolean;
};

/** A project's S3-compatible buckets (architecture 4.13 "Object storage", decision 48). */
export async function StorageTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const data = await listCloudBuckets(props.projectId).catch(() => null);
  if (!data) return <p className={styles.muted}>{t('common.loadError')}</p>;
  const number = new Intl.NumberFormat(props.locale);
  const example = [
    `// npm install @aws-sdk/client-s3`,
    `import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';`,
    ``,
    `const s3 = new S3Client({`,
    `  endpoint: '${data.endpoint ?? ''}',`,
    `  region: '${data.region ?? 'garage'}',`,
    `  forcePathStyle: true,`,
    `  credentials: {`,
    `    accessKeyId: process.env.S3_ACCESS_KEY_ID,`,
    `    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,`,
    `  },`,
    `});`,
    `await s3.send(new PutObjectCommand({ Bucket: '${data.items[0]?.name ?? 'my-bucket'}', Key: 'hello.txt', Body: 'Hello' }));`,
  ].join('\n');

  return (
    <section className={styles.landing} aria-labelledby="storage-title">
      <div>
        <h2 id="storage-title" className={styles.sectionTitle}>
          {t('project.tabs.storage')}
        </h2>
        <p className={styles.muted}>{t('storage.lead')}</p>
      </div>
      {!data.configured ? (
        <p className={styles.muted}>{t('storage.notSetUp')}</p>
      ) : (
        <>
          {data.items.length === 0 ? <p className={styles.muted}>{t('storage.empty')}</p> : null}
          {data.items.map((bucket) => (
            <article key={bucket.id} className={styles.card}>
              <p className={`${styles.rowTitle} ${styles.mono}`}>{bucket.name}</p>
              <p className={styles.small}>
                {bucket.sizeBytes === null
                  ? t('storage.usageUnknown')
                  : t('storage.usage', {
                      used: formatBytes(bucket.sizeBytes, props.locale),
                      max: formatBytes(bucket.maxBytes, props.locale),
                      objects: number.format(bucket.objects ?? 0),
                      maxObjects: number.format(bucket.maxObjects),
                    })}
              </p>
              <ul className={styles.list}>
                {bucket.keys.map((key) => (
                  <li key={key.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>
                        {key.name}
                        <Badge tone={key.write ? 'warning' : 'neutral'}>
                          {key.write ? t('storage.readWrite') : t('storage.readOnly')}
                        </Badge>
                      </p>
                      <p className={`${styles.small} ${styles.mono}`}>
                        {key.accessKeyId} · {formatWhen(key.createdAt, props.locale)}
                      </p>
                    </div>
                    {props.admin ? (
                      <form action={deleteBucketKeyAction}>
                        <input type="hidden" name="locale" value={props.locale} />
                        <input type="hidden" name="project" value={props.projectId} />
                        <input type="hidden" name="bucket" value={bucket.id} />
                        <input type="hidden" name="id" value={key.id} />
                        <input type="hidden" name="path" value={props.path} />
                        <SubmitButton size="sm" variant="ghost">
                          {t('storage.revoke')}
                          <span className="visually-hidden"> — {key.name}</span>
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
              {props.admin ? (
                <>
                  <details>
                    <summary className={styles.small}>{t('storage.newKey')}</summary>
                    <ActionForm
                      action={createBucketKeyAction.bind(
                        null,
                        props.locale,
                        props.path,
                        props.projectId,
                        bucket.id,
                      )}
                      className={styles.form}
                    >
                      <TokenReveal />
                      <FormInput
                        id={`${bucket.id}-key-name`}
                        name="name"
                        label={t('storage.keyName')}
                        required
                        maxLength={60}
                      />
                      <FormCheckbox
                        id={`${bucket.id}-key-write`}
                        name="write"
                        label={t('storage.canWrite')}
                      />
                      <div className={styles.actions}>
                        <SubmitButton size="sm" pendingLabel={t('storage.creating')}>
                          {t('storage.createKey')}
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                  <ActionForm
                    action={deleteBucketAction.bind(
                      null,
                      props.locale,
                      props.path,
                      props.projectId,
                      bucket.id,
                    )}
                  >
                    <SubmitButton size="sm" variant="ghost">
                      {t('storage.delete')}
                      <span className="visually-hidden"> — {bucket.name}</span>
                    </SubmitButton>
                  </ActionForm>
                </>
              ) : null}
            </article>
          ))}
          {props.admin ? (
            <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="bucket-new">
              <h3 id="bucket-new" className={styles.cardTitle}>
                {t('storage.newTitle')}
              </h3>
              <ActionForm
                action={createBucketAction.bind(null, props.locale, props.path, props.projectId)}
                className={styles.form}
              >
                <FormInput
                  name="name"
                  label={t('storage.name')}
                  hint={t('storage.nameHint')}
                  required
                  maxLength={63}
                  autoCapitalize="none"
                  spellCheck={false}
                  mono
                />
                <div className={styles.actions}>
                  <SubmitButton pendingLabel={t('storage.creating')}>
                    {t('storage.create')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </section>
          ) : null}
          <details className={styles.card}>
            <summary>{t('storage.howTo')}</summary>
            <p className={styles.small}>
              {t('storage.settings', { endpoint: data.endpoint ?? '', region: data.region ?? '' })}
            </p>
            <pre className={styles.terminal}>{example}</pre>
          </details>
          <p className={styles.small}>{t('storage.privacy')}</p>
        </>
      )}
    </section>
  );
}
