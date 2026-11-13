import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { TokenReveal } from '@/components/cloud/TokenReveal';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { listCloudDatabases } from '@/lib/api/cloud';
import { formatBytes, formatWhen } from '@/lib/cloud';
import { createDatabaseAction, deleteDatabaseAction, resetDatabaseAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  projectId: string;
  path: string;
  admin: boolean;
};

/** A project's managed PostgreSQL databases (architecture 4.13 "Databases", decision 47). */
export async function DatabasesTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const data = await listCloudDatabases(props.projectId).catch(() => null);
  if (!data) return <p className={styles.muted}>{t('common.loadError')}</p>;

  return (
    <section className={styles.landing} aria-labelledby="db-title">
      <div>
        <h2 id="db-title" className={styles.sectionTitle}>
          {t('project.tabs.databases')}
        </h2>
        <p className={styles.muted}>{t('databases.lead')}</p>
      </div>
      {!data.configured ? (
        <p className={styles.muted}>{t('databases.notSetUp')}</p>
      ) : (
        <>
          {data.items.length === 0 ? <p className={styles.muted}>{t('databases.empty')}</p> : null}
          {data.items.map((db) => (
            <article key={db.id} className={styles.card}>
              <p className={styles.rowTitle}>
                {db.name}
                {db.blocked ? (
                  <Badge tone="danger">{t('databases.blocked')}</Badge>
                ) : db.readOnly ? (
                  <Badge tone="warning">{t('databases.readOnly')}</Badge>
                ) : (
                  <Badge tone="success">{t('databases.ok')}</Badge>
                )}
              </p>
              <p className={styles.small}>
                {t('databases.size', {
                  used: formatBytes(db.sizeBytes, props.locale),
                  max: formatBytes(db.maxBytes, props.locale),
                })}
                {' · '}
                {t('databases.since', { when: formatWhen(db.createdAt, props.locale) })}
              </p>
              <CopyLink
                url={db.connectionUrl}
                labels={{ copy: t('common.copy'), copied: t('common.copied') }}
              />
              <p className={styles.small}>{t('databases.passwordHelp')}</p>
              {props.admin ? (
                <div className={styles.actions}>
                  <ActionForm
                    action={resetDatabaseAction.bind(
                      null,
                      props.locale,
                      props.path,
                      props.projectId,
                      db.id,
                    )}
                  >
                    <TokenReveal />
                    <SubmitButton
                      size="sm"
                      variant="outline"
                      pendingLabel={t('databases.resetting')}
                    >
                      {t('databases.resetPassword')}
                    </SubmitButton>
                  </ActionForm>
                  <form action={deleteDatabaseAction}>
                    <input type="hidden" name="locale" value={props.locale} />
                    <input type="hidden" name="project" value={props.projectId} />
                    <input type="hidden" name="id" value={db.id} />
                    <input type="hidden" name="path" value={props.path} />
                    <SubmitButton size="sm" variant="ghost">
                      {t('databases.delete')}
                      <span className="visually-hidden"> — {db.name}</span>
                    </SubmitButton>
                  </form>
                </div>
              ) : null}
            </article>
          ))}
          {props.admin ? (
            <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="db-new">
              <h3 id="db-new" className={styles.cardTitle}>
                {t('databases.newTitle')}
              </h3>
              <ActionForm
                action={createDatabaseAction.bind(null, props.locale, props.path, props.projectId)}
                className={styles.form}
              >
                <TokenReveal />
                <FormInput
                  name="name"
                  label={t('databases.name')}
                  hint={t('databases.nameHint')}
                  required
                  maxLength={40}
                />
                <div className={styles.actions}>
                  <SubmitButton pendingLabel={t('databases.creating')}>
                    {t('databases.create')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </section>
          ) : null}
          <p className={styles.small}>{t('databases.privacy')}</p>
        </>
      )}
    </section>
  );
}
