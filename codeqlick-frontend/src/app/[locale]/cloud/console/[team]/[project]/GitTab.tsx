import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormSelect } from '@/components/app/ActionForm';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { TokenReveal } from '@/components/cloud/TokenReveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import {
  getCloudGit,
  getCloudTeamGithub,
  listCloudEnv,
  listCloudGithubRepos,
  listCloudHooks,
} from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import {
  connectGithubAction,
  createHookAction,
  deleteEnvAction,
  deleteHookAction,
  disconnectGitAction,
  importEnvAction,
  saveEnvAction,
  saveGitAction,
} from '../../../actions';
import styles from '../../../cloud.module.css';
import { EnvImport } from './EnvImport';

type Props = {
  locale: AppLocale;
  teamSlug: string;
  projectId: string;
  projectSlug: string;
  path: string;
  admin: boolean;
  github?: string;
};

/** A project's GitHub connection, build settings and variables (architecture 4.13). */
export async function GitTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const [team, git, env] = await Promise.all([
    getCloudTeamGithub(props.teamSlug),
    getCloudGit(props.projectId),
    listCloudEnv(props.projectId).then((r) => r.items),
  ]);
  if (!team.configured) {
    return <p className={styles.muted}>{t('git.notConfigured')}</p>;
  }
  const hooks = git.repo
    ? await listCloudHooks(props.projectId)
        .then((r) => r.items)
        .catch(() => null)
    : [];
  const repos = (
    await Promise.all(
      team.installations
        .filter((i) => !i.suspended)
        .map((i) =>
          listCloudGithubRepos(props.teamSlug, i.id)
            .then((r) => r.items.map((repo) => ({ ...repo, installationId: i.id })))
            .catch(() => []),
        ),
    )
  ).flat();
  const connectForm = (label: string, variant: 'primary' | 'outline') => (
    <form action={connectGithubAction}>
      <input type="hidden" name="locale" value={props.locale} />
      <input type="hidden" name="team" value={props.teamSlug} />
      <input type="hidden" name="project" value={props.projectSlug} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </form>
  );
  const current = git.repoId && git.installationId ? `${git.installationId}:${git.repoId}` : '';

  return (
    <section className={styles.landing} aria-labelledby="git-title">
      <div>
        <h2 id="git-title" className={styles.sectionTitle}>
          {t('project.tabs.git')}
        </h2>
        <p className={styles.muted}>{t('git.lead')}</p>
      </div>
      {props.github === 'connected' ? <Alert tone="success">{t('git.connected')}</Alert> : null}
      {props.github === 'error' ? <Alert tone="error">{t('git.connectError')}</Alert> : null}

      {git.repo ? (
        <div className={styles.card}>
          <p className={styles.rowTitle}>
            <span className={styles.mono}>{git.repo}</span>
            <Badge tone="success">{t('git.branchBadge', { branch: git.branch })}</Badge>
          </p>
          <p className={styles.small}>{t('git.how', { branch: git.branch })}</p>
          {props.admin ? (
            <form action={disconnectGitAction}>
              <input type="hidden" name="locale" value={props.locale} />
              <input type="hidden" name="project" value={props.projectId} />
              <input type="hidden" name="path" value={props.path} />
              <SubmitButton size="sm" variant="ghost">
                {t('git.disconnect')}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {props.admin && team.installations.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>{t('git.connectLead')}</p>
          {connectForm(t('git.connect'), 'primary')}
        </div>
      ) : null}

      {props.admin && team.installations.length > 0 ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="settings-title">
          <h3 id="settings-title" className={styles.cardTitle}>
            {t('git.settings')}
          </h3>
          <ActionForm
            action={saveGitAction.bind(null, props.locale, props.path, props.projectId)}
            className={styles.form}
          >
            <FormSelect
              name="repo"
              label={t('git.repo')}
              defaultValue={current}
              options={[
                { value: '', label: t('git.chooseRepo') },
                ...repos.map((repo) => ({
                  value: `${repo.installationId}:${repo.id}`,
                  label: repo.fullName,
                })),
              ]}
            />
            <FormInput
              name="branch"
              label={t('git.branch')}
              hint={t('git.branchHint')}
              defaultValue={git.branch}
              required
              mono
            />
            <FormInput
              name="rootDir"
              label={t('git.rootDir')}
              hint={t('git.rootDirHint')}
              defaultValue={git.rootDir}
              mono
            />
            <FormInput
              name="installCommand"
              label={t('git.install')}
              defaultValue={git.installCommand}
              mono
            />
            <FormInput
              name="buildCommand"
              label={t('git.build')}
              defaultValue={git.buildCommand}
              mono
            />
            <FormInput
              name="outputDir"
              label={t('git.output')}
              hint={t('git.outputHint')}
              defaultValue={git.outputDir}
              mono
            />
            <FormSelect
              name="nodeVersion"
              label={t('git.node')}
              defaultValue={git.nodeVersion}
              options={['24', '22', '20'].map((v) => ({ value: v, label: `Node ${v}` }))}
            />
            <FormCheckbox
              name="buildBranches"
              label={t('git.buildBranches')}
              defaultChecked={git.buildBranches}
            />
            <FormCheckbox
              name="buildPullRequests"
              label={t('git.buildPullRequests')}
              defaultChecked={git.buildPullRequests}
            />
            <FormCheckbox
              name="previewChecks"
              label={t('git.previewChecks')}
              hint={t('git.previewChecksHint')}
              defaultChecked={git.previewChecks}
            />
            <FormCheckbox
              name="onlyRootChanges"
              label={t('git.onlyRootChanges')}
              defaultChecked={git.onlyRootChanges}
            />
            <div className={styles.actions}>
              <SubmitButton>{t('git.save')}</SubmitButton>
            </div>
          </ActionForm>
          <p className={styles.small}>{t('git.otherAccount')}</p>
          {connectForm(t('git.connectAnother'), 'outline')}
        </section>
      ) : null}

      <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="hooks-title">
        <h3 id="hooks-title" className={styles.cardTitle}>
          {t('hooks.title')}
        </h3>
        <p className={styles.small}>{t('hooks.lead')}</p>
        {!git.repo ? <p className={styles.muted}>{t('hooks.noRepo')}</p> : null}
        {git.repo && hooks === null ? (
          <p className={styles.muted}>{t('common.loadError')}</p>
        ) : null}
        {hooks && hooks.length === 0 ? <p className={styles.muted}>{t('hooks.empty')}</p> : null}
        {hooks && hooks.length > 0 ? (
          <ul className={styles.list}>
            {hooks.map((hook) => (
              <li key={hook.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {hook.name}
                    <Badge>{hook.branch}</Badge>
                  </p>
                  <p className={styles.small}>
                    <span className={styles.mono}>{hook.prefix}…</span> ·{' '}
                    {t('hooks.madeBy', { name: hook.createdBy?.name ?? '—' })} ·{' '}
                    {hook.lastCalledAt
                      ? t('hooks.lastCalled', { when: formatWhen(hook.lastCalledAt, props.locale) })
                      : t('hooks.neverCalled')}
                  </p>
                  {props.admin ? (
                    <details>
                      <summary className={styles.small}>
                        {t('hooks.delete')}
                        <span className="visually-hidden"> — {hook.name}</span>
                      </summary>
                      <ActionForm
                        action={deleteHookAction.bind(
                          null,
                          props.locale,
                          props.path,
                          props.projectId,
                          hook.id,
                        )}
                        className={styles.form}
                      >
                        <p className={styles.small}>{t('hooks.deleteWarning')}</p>
                        <FormCheckbox
                          id={`${hook.id}-confirm`}
                          name="confirm"
                          label={t('hooks.confirmDelete', { name: hook.name })}
                          required
                        />
                        <div className={styles.actions}>
                          <SubmitButton
                            size="sm"
                            variant="danger"
                            pendingLabel={t('hooks.deleting')}
                          >
                            {t('hooks.delete')}
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {props.admin && git.repo ? (
          <ActionForm
            action={createHookAction.bind(null, props.locale, props.path, props.projectId)}
            className={styles.form}
          >
            <TokenReveal />
            <p className={styles.small}>{t('hooks.shownOnce')}</p>
            <FormInput
              id="hook-name"
              name="name"
              label={t('hooks.name')}
              hint={t('hooks.nameHint')}
              required
              maxLength={60}
            />
            <FormInput
              id="hook-branch"
              name="branch"
              label={t('hooks.branch')}
              hint={t('hooks.branchHint')}
              defaultValue={git.branch}
              maxLength={200}
              mono
            />
            <div className={styles.actions}>
              <SubmitButton variant="outline" pendingLabel={t('hooks.creating')}>
                {t('hooks.create')}
              </SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </section>

      <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="env-title">
        <h3 id="env-title" className={styles.cardTitle}>
          {t('git.env')}
        </h3>
        <p className={styles.small}>{t('git.envLead')}</p>
        {env.length > 0 ? (
          <ul className={styles.list}>
            {env.map((row) => (
              <li key={row.key} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <span className={styles.mono}>{row.key}</span>
                    {row.production ? <Badge>{t('git.production')}</Badge> : null}
                    {row.preview ? <Badge>{t('git.preview')}</Badge> : null}
                  </p>
                </div>
                {props.admin ? (
                  <form action={deleteEnvAction}>
                    <input type="hidden" name="locale" value={props.locale} />
                    <input type="hidden" name="project" value={props.projectId} />
                    <input type="hidden" name="key" value={row.key} />
                    <input type="hidden" name="path" value={props.path} />
                    <SubmitButton size="sm" variant="ghost">
                      {t('git.delete')}
                      <span className="visually-hidden"> — {row.key}</span>
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {props.admin ? (
          <ActionForm
            action={saveEnvAction.bind(null, props.locale, props.path, props.projectId)}
            className={styles.form}
          >
            <FormInput
              name="key"
              label={t('git.key')}
              placeholder="API_KEY"
              required
              mono
              autoCapitalize="characters"
            />
            <FormInput
              name="value"
              type="password"
              label={t('git.value')}
              hint={t('git.valueHint')}
              autoComplete="off"
            />
            <FormCheckbox name="production" label={t('git.production')} defaultChecked />
            <FormCheckbox name="preview" label={t('git.preview')} defaultChecked />
            <div className={styles.actions}>
              <SubmitButton variant="outline">{t('git.saveEnv')}</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
        {props.admin ? (
          <EnvImport
            action={importEnvAction.bind(null, props.locale, props.path, props.projectId)}
          />
        ) : null}
      </section>
    </section>
  );
}
