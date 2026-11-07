/** What waits on a client in the portal (`GET /portal/todo`). */
export type TodoKind = 'approval' | 'proposal' | 'ticket' | 'brief' | 'review';

export interface TodoItem {
  kind: TodoKind;
  /** The update, proposal or request; the project for a brief or a review. */
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  since: string;
}

export interface TodoRows {
  approvals: Array<{
    id: string;
    title: string;
    createdAt: Date;
    project: { id: string; name: string };
  }>;
  proposals: Array<{
    id: string;
    title: string;
    validUntil: Date | null;
    sentAt: Date | null;
    createdAt: Date;
    project: { id: string; name: string } | null;
  }>;
  tickets: Array<{
    id: string;
    number: number;
    title: string;
    updatedAt: Date;
    project: { id: string; name: string } | null;
  }>;
  briefs: Array<{ requestedAt: Date; project: { id: string; name: string } }>;
  reviews: Array<{ requestedAt: Date; project: { id: string; name: string } }>;
}

/** Start of today (UTC): a proposal can be accepted through its `validUntil` day. */
function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Everything waiting on the client, oldest first; expired proposals are left out. */
export function buildTodo(rows: TodoRows, now: Date): TodoItem[] {
  const today = startOfDay(now);
  const items: Array<TodoItem & { at: Date }> = [
    ...rows.approvals.map((update) => ({
      kind: 'approval' as const,
      id: update.id,
      title: update.title,
      projectId: update.project.id,
      projectName: update.project.name,
      at: update.createdAt,
    })),
    ...rows.proposals
      .filter((proposal) => !proposal.validUntil || proposal.validUntil >= today)
      .map((proposal) => ({
        kind: 'proposal' as const,
        id: proposal.id,
        title: proposal.title,
        projectId: proposal.project?.id ?? null,
        projectName: proposal.project?.name ?? null,
        at: proposal.sentAt ?? proposal.createdAt,
      })),
    ...rows.tickets.map((ticket) => ({
      kind: 'ticket' as const,
      id: ticket.id,
      title: `#${ticket.number} ${ticket.title}`,
      projectId: ticket.project?.id ?? null,
      projectName: ticket.project?.name ?? null,
      at: ticket.updatedAt,
    })),
    ...rows.briefs.map((brief) => ({
      kind: 'brief' as const,
      id: brief.project.id,
      title: brief.project.name,
      projectId: brief.project.id,
      projectName: brief.project.name,
      at: brief.requestedAt,
    })),
    ...rows.reviews.map((review) => ({
      kind: 'review' as const,
      id: review.project.id,
      title: review.project.name,
      projectId: review.project.id,
      projectName: review.project.name,
      at: review.requestedAt,
    })),
  ].map((item) => ({ ...item, since: item.at.toISOString() }));
  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return items.map(({ at: _at, ...item }) => item);
}
