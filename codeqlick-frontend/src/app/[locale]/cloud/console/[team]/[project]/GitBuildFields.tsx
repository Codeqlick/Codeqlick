'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FormInput, FormSelect } from '@/components/app/ActionForm';
import type { CloudDetect } from '@/lib/api/cloud';
import {
  NODE_VERSIONS,
  detectNoteKeys,
  detectQuery,
  detectStatusParts,
  shouldSuggest,
  suggestedValues,
  type BuildField,
} from '@/lib/cloud-detect';
import { detectGitAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  team: string;
  repos: Array<{ value: string; label: string }>;
  defaults: {
    repo: string;
    branch: string;
    rootDir: string;
    installCommand: string;
    buildCommand: string;
    outputDir: string;
    nodeVersion: string;
  };
};

type Status = { phase: 'idle' } | { phase: 'checking' } | { phase: 'done'; found: CloudDetect };

/** How long the branch and root folder wait for typing to stop before asking. */
const TYPING_DELAY = 500;

function fieldValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : '';
}

/**
 * The connect form's repository and build fields (architecture 4.13). When the repository, the
 * branch or the root folder changes (while the project isn't connected, or for another repository
 * than the connected one), it asks for the suggested settings and fills the build command, output
 * folder and Node version the person hasn't edited; on failure nothing changes.
 */
export function GitBuildFields({ team, repos, defaults }: Props) {
  const t = useTranslations('Cloud.git');
  const [status, setStatus] = useState<Status>({ phase: 'idle' });
  const edited = useRef(new Set<BuildField>());
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function suggest(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>, delay: number) {
    const form = event.currentTarget.form;
    clearTimeout(timer.current);
    // Any answer to an earlier ask is now stale.
    const ask = ++latest.current;
    if (!form) return;
    timer.current = setTimeout(() => {
      const repo = fieldValue(form, 'repo');
      const branch = fieldValue(form, 'branch');
      const rootDir = fieldValue(form, 'rootDir');
      // A connected project's saved settings are never replaced for its own repository.
      if (!shouldSuggest(defaults.repo, repo) || !detectQuery(repo, branch, rootDir)) {
        setStatus({ phase: 'idle' });
        return;
      }
      setStatus({ phase: 'checking' });
      detectGitAction(team, repo, branch, rootDir)
        .catch(() => null)
        .then((found) => {
          if (ask !== latest.current) return;
          if (!found) {
            setStatus({ phase: 'idle' });
            return;
          }
          for (const [name, value] of Object.entries(suggestedValues(found, edited.current))) {
            const field = form.elements.namedItem(name);
            if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
              field.value = value;
            }
          }
          setStatus({ phase: 'done', found });
        });
    }, delay);
  }

  const markEdited = (field: BuildField) => () => {
    edited.current.add(field);
  };

  return (
    <>
      <FormSelect
        name="repo"
        label={t('repo')}
        defaultValue={defaults.repo}
        options={[{ value: '', label: t('chooseRepo') }, ...repos]}
        onChange={(event) => suggest(event, 0)}
      />
      <FormInput
        name="branch"
        label={t('branch')}
        hint={t('branchHint')}
        defaultValue={defaults.branch}
        required
        mono
        onChange={(event) => suggest(event, TYPING_DELAY)}
      />
      <FormInput
        name="rootDir"
        label={t('rootDir')}
        hint={t('rootDirHint')}
        defaultValue={defaults.rootDir}
        mono
        onChange={(event) => suggest(event, TYPING_DELAY)}
      />
      <div className={styles.detect} aria-live="polite">
        {status.phase === 'checking' ? (
          <p className={styles.small}>{t('detect.checking')}</p>
        ) : null}
        {status.phase === 'done' ? (
          <p className={styles.small}>
            {detectStatusParts(status.found)
              .map((part) => t(`detect.${part.key}`, part.values))
              .join(' · ')}
          </p>
        ) : null}
        {status.phase === 'done' && status.found.notes.length > 0 ? (
          <ul className={styles.detectNotes}>
            {detectNoteKeys(status.found).map((key) => (
              <li key={key}>{t(`detect.notes.${key}`)}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <FormInput
        name="installCommand"
        label={t('install')}
        defaultValue={defaults.installCommand}
        mono
      />
      <FormInput
        name="buildCommand"
        label={t('build')}
        hint={t('commandsHint')}
        defaultValue={defaults.buildCommand}
        mono
        onChange={markEdited('buildCommand')}
      />
      <FormInput
        name="outputDir"
        label={t('output')}
        hint={t('outputHint')}
        defaultValue={defaults.outputDir}
        mono
        onChange={markEdited('outputDir')}
      />
      <FormSelect
        name="nodeVersion"
        label={t('node')}
        defaultValue={defaults.nodeVersion}
        options={NODE_VERSIONS.map((v) => ({ value: v, label: `Node ${v}` }))}
        onChange={markEdited('nodeVersion')}
      />
    </>
  );
}
