import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getCloudKv, listCloudKv } from '@/lib/api/cloud';
import { formatBytes, formatWhen } from '@/lib/cloud';
import { deleteKvAction, putKvAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  projectId: string;
  projectSlug: string;
  path: string;
  base: string;
  apiUrl: string;
  prefix?: string;
  cursor?: string;
  selected?: string;
};

/** A project's key-value store (architecture 4.13 "Key-value store", decision 45). */
export async function KvTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const list = await listCloudKv(props.projectId, props.prefix, props.cursor).catch(() => null);
  if (!list) return <p className={styles.muted}>{t('common.loadError')}</p>;
  const entry = props.selected
    ? await getCloudKv(props.projectId, props.selected).catch(() => null)
    : null;
  const number = new Intl.NumberFormat(props.locale);
  const href = (query: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ tab: 'kv' });
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    return `${props.base}?${params.toString()}`;
  };
  const endpoint = `${props.apiUrl}/cloud/projects/${props.projectId}/kv`;
  const examples = [
    `# ${t('kv.exampleWrite')}`,
    `curl -X PUT ${endpoint}/config:theme \\`,
    `  -H "Authorization: Bearer $CODEQLICK_TOKEN" -H "Content-Type: application/json" \\`,
    `  -d '{"value":{"dark":true},"ttl":86400}'`,
    `# ${t('kv.exampleRead')}`,
    `curl ${endpoint}/config:theme -H "Authorization: Bearer $CODEQLICK_TOKEN"`,
    `# ${t('kv.exampleIncr')}`,
    `curl -X POST ${endpoint}/visits/incr -H "Authorization: Bearer $CODEQLICK_TOKEN" -d '{}'`,
    `# ${t('kv.examplePublic')}`,
    `fetch('${props.apiUrl}/cloud/kv/${props.projectSlug}/public:flags').then((r) => r.json())`,
  ].join('\n');

  return (
    <section className={styles.landing} aria-labelledby="kv-title">
      <div>
        <h2 id="kv-title" className={styles.sectionTitle}>
          {t('project.tabs.kv')}
        </h2>
        <p className={styles.muted}>{t('kv.lead')}</p>
      </div>

      <div className={styles.meters}>
        <div className={styles.meter}>
          <span className={styles.small}>{t('kv.keys')}</span>
          <span className={styles.meterValue}>
            {number.format(list.usage.keys)} / {number.format(list.usage.maxKeys)}
          </span>
        </div>
        <div className={styles.meter}>
          <span className={styles.small}>{t('kv.size')}</span>
          <span className={styles.meterValue}>
            {formatBytes(list.usage.bytes, props.locale)} /{' '}
            {formatBytes(list.usage.maxBytes, props.locale)}
          </span>
        </div>
      </div>

      <form className={styles.inline} action={props.base} method="get">
        <input type="hidden" name="tab" value="kv" />
        <FormInput
          name="prefix"
          label={t('kv.prefix')}
          defaultValue={props.prefix ?? ''}
          maxLength={256}
        />
        <SubmitButton size="sm" variant="outline">
          {t('kv.filter')}
        </SubmitButton>
      </form>

      {list.items.length === 0 ? (
        <p className={styles.muted}>{props.prefix ? t('kv.noMatch') : t('kv.empty')}</p>
      ) : (
        <div className={styles.dnsWrap}>
          <table className={styles.top}>
            <thead>
              <tr>
                <th scope="col">{t('kv.key')}</th>
                <th scope="col">{t('kv.size')}</th>
                <th scope="col">{t('kv.expires')}</th>
                <th scope="col">{t('kv.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.key}>
                  <td>
                    <Link
                      href={href({ prefix: props.prefix, cursor: props.cursor, key: item.key })}
                      className={styles.mono}
                      aria-current={props.selected === item.key ? 'true' : undefined}
                    >
                      {item.key}
                    </Link>
                  </td>
                  <td>{formatBytes(item.size, props.locale)}</td>
                  <td>{item.expiresAt ? formatWhen(item.expiresAt, props.locale) : '—'}</td>
                  <td>{formatWhen(item.updatedAt, props.locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.cursor || props.cursor ? (
        <div className={styles.actions}>
          {props.cursor ? <Link href={href({ prefix: props.prefix })}>{t('kv.first')}</Link> : null}
          {list.cursor ? (
            <Link href={href({ prefix: props.prefix, cursor: list.cursor })}>{t('kv.next')}</Link>
          ) : null}
        </div>
      ) : null}

      {props.selected ? (
        <article className={styles.card} aria-labelledby="kv-entry">
          <h3 id="kv-entry" className={`${styles.cardTitle} ${styles.mono}`}>
            {props.selected}
          </h3>
          {entry ? (
            <>
              <pre className={styles.value}>{JSON.stringify(entry.value, null, 2)}</pre>
              <form action={deleteKvAction}>
                <input type="hidden" name="locale" value={props.locale} />
                <input type="hidden" name="project" value={props.projectId} />
                <input type="hidden" name="key" value={entry.key} />
                <input type="hidden" name="path" value={props.path} />
                <SubmitButton size="sm" variant="ghost">
                  {t('kv.delete')}
                  <span className="visually-hidden"> — {entry.key}</span>
                </SubmitButton>
              </form>
            </>
          ) : (
            <p className={styles.muted}>{t('kv.gone')}</p>
          )}
        </article>
      ) : null}

      <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="kv-new">
        <h3 id="kv-new" className={styles.cardTitle}>
          {entry ? t('kv.editTitle') : t('kv.newTitle')}
        </h3>
        <ActionForm
          action={putKvAction.bind(null, props.locale, props.path, props.projectId)}
          className={styles.form}
        >
          <FormInput
            name="key"
            label={t('kv.key')}
            hint={t('kv.keyHint')}
            defaultValue={entry?.key}
            required
            maxLength={256}
          />
          <FormTextarea
            name="value"
            label={t('kv.value')}
            hint={t('kv.valueHint')}
            defaultValue={entry ? JSON.stringify(entry.value, null, 2) : ''}
            rows={6}
            required
          />
          <FormCheckbox name="asText" label={t('kv.asText')} />
          <FormInput
            name="ttl"
            type="number"
            label={t('kv.ttl')}
            hint={t('kv.ttlHint')}
            min={1}
            max={31_536_000}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('kv.saving')}>{t('kv.save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <details className={styles.card}>
        <summary>{t('kv.howTo')}</summary>
        <pre className={styles.terminal}>{examples}</pre>
        <p className={styles.small}>{t('kv.publicHelp')}</p>
      </details>
    </section>
  );
}
