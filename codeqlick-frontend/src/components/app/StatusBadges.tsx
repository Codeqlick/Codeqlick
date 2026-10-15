import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type {
  LeadStatus,
  ProposalStatus,
  PublishStatus,
  TicketPriority,
  TicketStatus,
} from '@/lib/api/types';

const LEAD_TONES: Record<LeadStatus, BadgeTone> = {
  NEW: 'brand',
  TALKING: 'warning',
  CALL: 'warning',
  PROPOSAL: 'ink',
  WON: 'success',
  LOST: 'danger',
  SPAM: 'neutral',
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

const TICKET_TONES: Record<TicketStatus, BadgeTone> = {
  OPEN: 'brand',
  IN_PROGRESS: 'warning',
  WAITING_CLIENT: 'ink',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export function TicketStatusBadge({ status, label }: { status: TicketStatus; label: string }) {
  return <Badge tone={TICKET_TONES[status]}>{label}</Badge>;
}

/** Only the priorities worth flagging get a colour. */
export function TicketPriorityBadge({
  priority,
  label,
}: {
  priority: TicketPriority;
  label: string;
}) {
  const tone = priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}

const PROPOSAL_TONES: Record<ProposalStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'brand',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  WITHDRAWN: 'neutral',
};

/** A sent proposal past its valid date shows as expired. */
export function ProposalStatusBadge({
  status,
  expired,
  label,
}: {
  status: ProposalStatus;
  expired: boolean;
  label: string;
}) {
  return <Badge tone={expired ? 'warning' : PROPOSAL_TONES[status]}>{label}</Badge>;
}
