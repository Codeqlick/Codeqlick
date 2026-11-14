/**
 * Production lock after a rollback (architecture 4.13). Promoting a deployment older than the
 * current production one locks production, so builds from Git can't bring back what was just
 * rolled back; explicit releases (an upload with target `production`, promoting a newer one)
 * unlock it.
 */

/** What a change of production does to the lock. */
export type LockChange = 'lock' | 'unlock' | 'keep';

/** The line a production build kept as a preview ends its log with. */
export const LOCKED_BUILD_LOG_LINE =
  'Production is locked after a rollback: promote this deployment to publish it';

interface DeploymentAge {
  id: string;
  createdAt: Date;
}

export type ProductionSource =
  /** `POST …/deployments/:id/promote` (console, `codeqlick rollback` or `promote`). */
  | { kind: 'promote'; current: DeploymentAge | null; promoted: DeploymentAge }
  /** An upload with target `production` (`codeqlick deploy --prod`). */
  | { kind: 'upload' }
  /** A production build from Git (a push, "Deploy again"). */
  | { kind: 'build' };

/**
 * The lock change for a new production. Promoting the current one again, or with no production
 * yet, changes nothing; an older one locks (an existing lock is kept as it is, with its date and
 * person); a newer one (or one as old) unlocks. Uploads unlock; builds never change the lock (they
 * don't publish while it's on, see `keptAsPreview`).
 */
export function lockChange(source: ProductionSource): LockChange {
  switch (source.kind) {
    case 'upload':
      return 'unlock';
    case 'build':
      return 'keep';
    case 'promote': {
      const { current, promoted } = source;
      if (!current || current.id === promoted.id) return 'keep';
      return promoted.createdAt.getTime() < current.createdAt.getTime() ? 'lock' : 'unlock';
    }
  }
}

/** Whether a finished build was kept as a preview: a production build that didn't publish. */
export function keptAsPreview(target: 'PREVIEW' | 'PRODUCTION', published: boolean): boolean {
  return target === 'PRODUCTION' && !published;
}
