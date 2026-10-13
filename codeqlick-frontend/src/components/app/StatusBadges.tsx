import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { LeadStatus, PublishStatus } from '@/lib/api/types';

const LEAD_TONES: Record<LeadStatus, BadgeTone> = {
  NEW: 'brand',
  CONTACTED: 'warning',
  QUALIFIED: 'ink',
  WON: 'success',
  LOST: 'danger',
  ARCHIVED: 'neutral',
};

export function LeadStatusBadge({ status, label }: { status: LeadStatus; label: string }) {
  return <Badge tone={LEAD_TONES[status]}>{label}</Badge>;
}

export function PublishStatusBadge({ status, label }: { status: PublishStatus; label: string }) {
  return <Badge tone={status === 'PUBLISHED' ? 'success' : 'neutral'}>{label}</Badge>;
}
