import type { Category } from '../site-audits/site-audit-checks.js';

/** The website check of a pull request's preview, as the comment shows it (decision 52). */
export type PreviewCheck =
  | { state: 'running' }
  | {
      state: 'done';
      auditId: string;
      score: number;
      categories: Record<Category, number>;
      /** Titles of the failed checks, at most 5. */
      failed: string[];
      warnings: number;
    }
  | { state: 'skipped' }
  | { state: 'unavailable'; reason: string };

/** The checks a preview never gets judged on: previews answer `noindex` by design. */
export const PREVIEW_IGNORED_CHECKS = ['indexable'] as const;

/** Whether a finished build's preview gets the website check: a pull request's, when switched on. */
export function shouldCheckPreview(
  build: { trigger: string; target: string; pullRequest: number | null },
  project: { previewChecks: boolean },
): boolean {
  return (
    project.previewChecks &&
    build.trigger === 'PULL_REQUEST' &&
    build.target === 'PREVIEW' &&
    build.pullRequest !== null
  );
}

const NAMES: Array<[Category, string]> = [
  ['speed', 'Speed'],
  ['mobile', 'Mobile'],
  ['seo', 'Google'],
  ['security', 'Security'],
];

/** The comment's "Website check" section, as Markdown lines. */
export function previewCheckLines(check: PreviewCheck, auditUrl: (id: string) => string): string[] {
  switch (check.state) {
    case 'running':
      return ['Website check: running…'];
    case 'skipped':
      return ['Website check skipped: hourly limit reached'];
    case 'unavailable':
      return [`Website check: couldn't open the preview (${check.reason})`];
    case 'done': {
      const scores = NAMES.map(([key, name]) => `${name} ${check.categories[key]}`).join(' · ');
      return [
        `**Website check: ${check.score}/100**`,
        scores,
        ...(check.failed.length > 0
          ? ['', 'Failed:', ...check.failed.map((title) => `- ${title}`)]
          : []),
        '',
        `${check.warnings} ${check.warnings === 1 ? 'warning' : 'warnings'} · [Full report](${auditUrl(check.auditId)})`,
      ];
    }
  }
}

/** The app's comment on a pull request. */
export function commentBody(input: {
  project: string;
  commit: string;
  state: 'pending' | 'success' | 'failure';
  buildUrl: string;
  deploymentUrl?: string;
  check?: PreviewCheck;
  auditUrl: (id: string) => string;
}): string {
  return [
    `**Codeqlick Cloud** · ${input.project}`,
    '',
    '| | |',
    '|---|---|',
    `| Commit | \`${input.commit.slice(0, 7)}\` |`,
    `| State | ${{ pending: '⏳ Building', success: '✅ Ready', failure: '❌ Failed' }[input.state]} |`,
    ...(input.deploymentUrl ? [`| Preview | ${input.deploymentUrl} |`] : []),
    `| Build | ${input.buildUrl} |`,
    ...(input.check ? ['', ...previewCheckLines(input.check, input.auditUrl)] : []),
  ].join('\n');
}
