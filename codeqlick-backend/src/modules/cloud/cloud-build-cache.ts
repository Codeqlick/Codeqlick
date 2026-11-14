/**
 * The key of a build's dependency cache (architecture 4.13, decision 68):
 * `<projectId>/<production|preview>-node<major>`. Production builds and every other build keep
 * separate caches, so code from a branch can't write what production installs.
 */
export function cacheKey(
  projectId: string,
  target: 'PRODUCTION' | 'PREVIEW',
  nodeVersion: string,
): string {
  const major = Number.parseInt(nodeVersion, 10);
  return `${projectId}/${target === 'PRODUCTION' ? 'production' : 'preview'}-node${major}`;
}
