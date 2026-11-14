import { formatPercent, type AnalyticsChange as Change } from '@/lib/analytics-change';

type Props = {
  change: Change;
  /** Already translated: "{value} vs previous 7 days" is built by `text`. */
  text: (value: string) => string;
  newLabel: string;
  classNames: { up: string; down: string; same: string; new: string };
};

/** The change under a total. The text carries the meaning; the colour only reinforces it. */
export function AnalyticsChange({ change, text, newLabel, classNames }: Props) {
  return (
    <span className={classNames[change.kind]} data-change={change.kind}>
      {change.kind === 'new' ? newLabel : text(formatPercent(change.percent))}
    </span>
  );
}
