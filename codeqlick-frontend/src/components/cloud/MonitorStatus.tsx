import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { CloudMonitorState } from '@/lib/api/cloud';

const TONE: Record<CloudMonitorState, BadgeTone> = {
  UP: 'success',
  DOWN: 'danger',
  PAUSED: 'neutral',
  UNKNOWN: 'warning',
};

/** A monitor's state as a badge (the label comes translated). */
export function MonitorStatus({ status, label }: { status: CloudMonitorState; label: string }) {
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
