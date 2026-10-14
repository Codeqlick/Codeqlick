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

/** Published, draft, or scheduled (published with a date still to come). */
export function PublishStatusBadge({
  status,
  scheduled = false,
  label,
}: {
  status: PublishStatus;
  scheduled?: boolean;
  label: string;
}) {
  const tone = scheduled ? 'warning' : status === 'PUBLISHED' ? 'success' : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}
