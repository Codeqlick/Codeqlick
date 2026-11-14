import type { CloudBuildStatus } from '../../generated/prisma/client.js';

/** What a project's README badge says (architecture 4.13 "Status badge"). */
export type DeployBadgeState = 'building' | 'failed' | 'deployed' | 'not-deployed' | 'unknown';

/** What the badge is drawn from: null when the project doesn't exist or is not public. */
export interface DeployBadgeFacts {
  /** Its latest production build that wasn't canceled, if any. */
  latestBuild: { status: CloudBuildStatus; queuedAt: Date } | null;
  /** When its current production deployment was made, if it has one. */
  productionAt: Date | null;
}

export function deployBadgeState(facts: DeployBadgeFacts | null): DeployBadgeState {
  if (!facts) return 'unknown';
  const build = facts.latestBuild;
  if (build?.status === 'QUEUED' || build?.status === 'RUNNING') return 'building';
  // A failed build counts until something newer (a CLI deploy) is production.
  if (build?.status === 'FAILED' && !(facts.productionAt && facts.productionAt > build.queuedAt)) {
    return 'failed';
  }
  return facts.productionAt ? 'deployed' : 'not-deployed';
}

const DEPLOY_BADGE: Record<DeployBadgeState, [text: string, color: string]> = {
  building: ['building', '#1d5fbf'],
  failed: ['failed', '#b3261e'],
  deployed: ['deployed', '#1e7a4a'],
  'not-deployed': ['not deployed', '#5c5768'],
  unknown: ['unknown', '#5c5768'],
};

export function deployBadgeSvg(state: DeployBadgeState): string {
  const [text, color] = DEPLOY_BADGE[state];
  return badgeSvg('codeqlick', text, color);
}

/**
 * A small two-part badge like shields.io's: `left` on ink, `right` on `color`. Texts are fixed by
 * the callers (never user input); widths come from a per-character estimate, so no font is needed.
 */
export function badgeSvg(left: string, right: string, color: string): string {
  const lw = 6 * left.length + 12;
  const rw = 6.5 * right.length + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left}: ${right}"><title>${left}: ${right}</title><rect width="${lw}" height="20" fill="#14101f"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="14">${left}</text><text x="${lw + rw / 2}" y="14">${right}</text></g></svg>`;
}
