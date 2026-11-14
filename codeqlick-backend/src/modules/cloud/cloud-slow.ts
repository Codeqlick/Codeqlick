/** Consecutive checks needed to start or end a slow episode (architecture 4.13, Slow responses). */
export const SLOW_CHECKS = 3;

export interface SlowState {
  slowCount: number;
  slowSince: Date | null;
}

export interface SlowStep extends SlowState {
  /** `slow` when the episode just started, `fast` when it just ended. */
  alert: 'slow' | 'fast' | null;
}

/**
 * One successful check of a monitor with a `slowMs` threshold. Outside an episode, 3 slow checks
 * in a row start one; inside, 3 normal ones in a row end it. A check is slow above the threshold.
 */
export function slowStep(
  state: SlowState,
  responseMs: number,
  slowMs: number,
  now: Date,
): SlowStep {
  const slow = responseMs > slowMs;
  const inEpisode = state.slowSince !== null;
  // Slow checks count outside an episode, normal ones inside it; the other kind resets.
  const count = slow === !inEpisode ? state.slowCount + 1 : 0;
  if (count < SLOW_CHECKS) return { slowCount: count, slowSince: state.slowSince, alert: null };
  return inEpisode
    ? { slowCount: 0, slowSince: null, alert: 'fast' }
    : { slowCount: 0, slowSince: now, alert: 'slow' };
}
