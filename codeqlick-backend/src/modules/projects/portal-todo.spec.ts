import { describe, expect, it } from 'vitest';
import { buildTodo } from './portal-todo.js';

const project = { id: 'p1', name: 'Tienda' };

describe('buildTodo', () => {
  it('lists what waits on the client, oldest first, without expired proposals', () => {
    const items = buildTodo(
      {
        approvals: [
          { id: 'u1', title: 'Portada', createdAt: new Date('2026-11-05T10:00:00Z'), project },
        ],
        proposals: [
          {
            id: 'pr1',
            title: 'Blog',
            validUntil: new Date('2026-11-07T00:00:00Z'),
            sentAt: new Date('2026-11-01T09:00:00Z'),
            createdAt: new Date('2026-10-30T09:00:00Z'),
            project: null,
          },
          {
            id: 'pr2',
            title: 'Old',
            validUntil: new Date('2026-11-06T00:00:00Z'),
            sentAt: new Date('2026-10-01T09:00:00Z'),
            createdAt: new Date('2026-10-01T09:00:00Z'),
            project,
          },
        ],
        tickets: [
          {
            id: 't1',
            number: 12,
            title: 'Pedidos',
            updatedAt: new Date('2026-11-06T08:00:00Z'),
            project,
          },
        ],
        briefs: [{ requestedAt: new Date('2026-10-20T08:00:00Z'), project }],
        reviews: [],
      },
      new Date('2026-11-07T15:00:00Z'),
    );
    expect(items.map((item) => [item.kind, item.id])).toEqual([
      ['brief', 'p1'],
      ['proposal', 'pr1'],
      ['approval', 'u1'],
      ['ticket', 't1'],
    ]);
    expect(items[3]).toMatchObject({ title: '#12 Pedidos', projectName: 'Tienda' });
    expect(items[1]).toMatchObject({ projectId: null, since: '2026-11-01T09:00:00.000Z' });
  });
});
