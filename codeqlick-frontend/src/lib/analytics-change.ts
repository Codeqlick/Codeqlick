export type AnalyticsChange = { kind: 'up' | 'down' | 'same' | 'new'; percent: number };

/**
 * The change of a total against the previous period (architecture 4.13 "Web analytics"):
 * null when both are 0, "new" when only the previous is 0, otherwise the whole-percent change
 * (`same` when it rounds to 0).
 */
export function changeAgainst(current: number, previous: number): AnalyticsChange | null {
  if (previous === 0) return current > 0 ? { kind: 'new', percent: 0 } : null;
  const percent = Math.round(((current - previous) / previous) * 100) || 0;
  return { kind: percent > 0 ? 'up' : percent < 0 ? 'down' : 'same', percent };
}

/** "+12 %", "−8 %" (real minus sign) or "0 %". */
export function formatPercent(percent: number): string {
  if (percent > 0) return `+${percent} %`;
  if (percent < 0) return `−${Math.abs(percent)} %`;
  return '0 %';
}
