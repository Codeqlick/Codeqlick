import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { CloudPublicMonitorState } from '@/lib/api/cloud';

const TONE: Record<CloudPublicMonitorState, BadgeTone> = {
  UP: 'success',
  DOWN: 'danger',
  PAUSED: 'neutral',
  UNKNOWN: 'warning',
  MAINTENANCE: 'info',
};

/** A monitor's state as a badge (the label comes translated). */
export function MonitorStatus({
  status,
  label,
}: {
  status: CloudPublicMonitorState;
  label: string;
}) {
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
