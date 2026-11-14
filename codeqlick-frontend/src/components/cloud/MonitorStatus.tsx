import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { CloudMonitorState } from '@/lib/api/cloud';

const TONE: Record<CloudMonitorState, BadgeTone> = {
  UP: 'success',
  DOWN: 'danger',
  PAUSED: 'neutral',
  UNKNOWN: 'warning',
};

/** The "slow" badge shown while a slow episode lasts (the state stays up). */
export function SlowBadge({ label }: { label: string }) {
  return <Badge tone="warning">{label}</Badge>;
}

/** A monitor's state as a badge (the label comes translated). */
export function MonitorStatus({ status, label }: { status: CloudMonitorState; label: string }) {
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
