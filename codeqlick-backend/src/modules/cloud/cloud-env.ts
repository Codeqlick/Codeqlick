/** What `buildEnvRows` needs of a stored variable (`CloudEnvVar`). */
export interface EnvVarRow {
  key: string;
  production: boolean;
  preview: boolean;
  /** The preview branch the variable is only for; `''` = every build of its targets. */
  branch: string;
}

/**
 * The variables a build receives (architecture 4.13). A production build gets the general
 * variables marked for production and never a branch's. A preview gets the general variables
 * marked for previews, and then the variables of its own branch, which replace the general ones
 * with the same key.
 */
export function buildEnvRows<T extends EnvVarRow>(
  rows: readonly T[],
  target: 'PRODUCTION' | 'PREVIEW',
  branch: string,
): T[] {
  const chosen = new Map<string, T>();
  if (target === 'PRODUCTION') {
    for (const row of rows) if (row.branch === '' && row.production) chosen.set(row.key, row);
    return [...chosen.values()];
  }
  for (const row of rows) if (row.branch === '' && row.preview) chosen.set(row.key, row);
  if (branch !== '') {
    for (const row of rows) if (row.branch === branch && row.preview) chosen.set(row.key, row);
  }
  return [...chosen.values()];
}
