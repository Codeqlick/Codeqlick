import { createHash } from 'node:crypto';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import {
  CATEGORIES,
  CHECK_CATEGORY,
  type Category,
  type CheckId,
  type CheckResult,
} from '../site-audits/site-audit-checks.js';
import { CATEGORY_NAMES, CHECK_TEXTS } from '../site-audits/site-audit-texts.js';
import type { StoredResult } from '../site-audits/site-audits.service.js';
import { nextRebuild } from './cloud-rebuild-schedule.js';

/** The weekly website check of production (architecture 4.13 "Production checks", decision 81). */

/** Projects checked per tick. */
export const PRODUCTION_CHECKS_PER_RUN = 5;

/** Scheduled audits are kept this long (12 weeks of history is 84 days). */
export const SCHEDULED_AUDIT_DAYS = 90;
/** The other kinds. */
export const AUDIT_DAYS = 30;
/** Weeks the history lists. */
export const HISTORY_WEEKS = 12;

/** Points lost, overall or in a category, that count as a drop. */
export const DROP_POINTS = 10;

/** Checks that vary from run to run: they count in the scores, never trigger a drop alone. */
export const VOLATILE_CHECKS: readonly CheckId[] = ['ttfb', 'psi-performance', 'psi-lcp'];

export interface ProductionSlot {
  /** 1–7, Monday first. */
  weekday: number;
  /** 1–5, Madrid time. */
  hour: number;
  /** 0–59. */
  minute: number;
}

/**
 * A project's fixed weekly slot, from SHA-256 of its id: the first byte picks the weekday, the
 * second the hour (01:00–05:59 Madrid time) and the third the minute. Never stored.
 */
export function productionSlot(projectId: string): ProductionSlot {
  const bytes = createHash('sha256').update(projectId).digest();
  return {
    weekday: (bytes[0]! % 7) + 1,
    hour: (bytes[1]! % 5) + 1,
    minute: bytes[2]! % 60,
  };
}

/** The first run of a project's slot strictly after `after` (Madrid wall-clock time). */
export function nextProductionCheck(projectId: string, after: Date): Date {
  const slot = productionSlot(projectId);
  // A weekly schedule always has a next run.
  return nextRebuild({ frequency: 'WEEKLY', ...slot }, after)!;
}

/** Why a due project is not checked this time, or null when it is. */
export function skipReason(project: {
  deletedAt: Date | null;
  suspendedAt: Date | null;
  productionDeploymentId: string | null;
  protection: 'OFF' | 'PREVIEWS' | 'ALL';
}): string | null {
  if (project.deletedAt) return 'the project is deleted';
  if (project.suspendedAt) return 'the project is suspended';
  if (!project.productionDeploymentId) return 'there is no production deployment';
  if (project.protection === 'ALL') return 'production is password protected';
  return null;
}

/** What a stored audit has that the comparison needs. */
export interface ComparableAudit {
  score: number;
  result: unknown;
}

export interface Drop {
  /** The overall score, when it fell 10 points or more. */
  score: { from: number; to: number } | null;
  categories: Array<{ key: Category; from: number; to: number }>;
  /** Checks that went from pass to fail. */
  checks: Array<{ id: CheckId; category: Category }>;
}

/**
 * Whether `next` dropped from `previous` (decision 81): the score or a category 10 or more points
 * lower, or a check of both going from pass to fail (the volatile ones apart). Null when not.
 */
export function compareAudits(previous: ComparableAudit, next: ComparableAudit): Drop | null {
  const before = previous.result as StoredResult;
  const after = next.result as StoredResult;
  const score =
    previous.score - next.score >= DROP_POINTS ? { from: previous.score, to: next.score } : null;
  const categories = CATEGORIES.flatMap((key) => {
    const from = before.categories[key];
    const to = after.categories[key];
    return from - to >= DROP_POINTS ? [{ key, from, to }] : [];
  });
  const earlier = new Map<CheckId, CheckResult>(
    before.checks.map((check) => [check.id, check] as const),
  );
  const checks = after.checks.flatMap((check) => {
    if (VOLATILE_CHECKS.includes(check.id) || check.status !== 'fail') return [];
    return earlier.get(check.id)?.status === 'pass'
      ? [{ id: check.id, category: CHECK_CATEGORY[check.id] }]
      : [];
  });
  if (!score && categories.length === 0 && checks.length === 0) return null;
  return { score, categories, checks };
}

/** The lines of a drop in `locale`, overall first, then categories, then checks. */
export function dropLines(drop: Drop, locale: ApiLocale): Array<{ label: string; value: string }> {
  const es = locale === 'es';
  return [
    ...(drop.score
      ? [{ label: es ? 'Nota' : 'Score', value: `${drop.score.from} → ${drop.score.to}` }]
      : []),
    ...drop.categories.map((c) => ({
      label: CATEGORY_NAMES[c.key][locale],
      value: `${c.from} → ${c.to}`,
    })),
    ...drop.checks.map((c) => ({
      label: CHECK_TEXTS[c.id].title[locale],
      value: es ? 'bien → fallo' : 'pass → fail',
    })),
  ];
}
