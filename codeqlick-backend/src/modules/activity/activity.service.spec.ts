import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { ActivityRepository } from './activity.repository.js';
import { ActivityService, contentLabel, publishVerb } from './activity.service.js';

const actor: AuthUser = { id: 'a1', email: 'ada@codeqlick.com', name: 'Ada', role: 'ADMIN' };

describe('ActivityService', () => {
  it('stores the actor name, the target type and the label at the time', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const service = new ActivityService({ create } as unknown as ActivityRepository);

    await service.record(actor, {
      action: 'post.published',
      targetId: 'p1',
      targetLabel: 'Hello',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'a1',
        actorName: 'Ada',
        action: 'post.published',
        targetType: 'post',
        targetId: 'p1',
        targetLabel: 'Hello',
      }),
    );
  });

  it('falls back to the email when the actor has no name', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const service = new ActivityService({ create } as unknown as ActivityRepository);

    await service.record({ ...actor, name: '' }, { action: 'media.uploaded' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ actorName: 'ada@codeqlick.com' }),
    );
  });

  it('never fails the change it records', async () => {
    const create = vi.fn().mockRejectedValue(new Error('database down'));
    const service = new ActivityService({ create } as unknown as ActivityRepository);

    await expect(service.record(actor, { action: 'post.deleted' })).resolves.toBeUndefined();
  });
});

describe('contentLabel', () => {
  it('prefers the Spanish title, then any title, then the slug', () => {
    const es = { locale: 'es', title: 'Hola' };
    const en = { locale: 'en', title: 'Hello' };
    expect(contentLabel({ slug: 's', translations: [en, es] })).toBe('Hola');
    expect(contentLabel({ slug: 's', translations: [en] })).toBe('Hello');
    expect(contentLabel({ slug: 's', translations: [] })).toBe('s');
  });
});

describe('publishVerb', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const draft = { status: 'DRAFT', publishedAt: null };
  const live = { status: 'PUBLISHED', publishedAt: '2026-10-01T09:00:00.000Z' };
  const future = { status: 'PUBLISHED', publishedAt: '2026-10-20T09:00:00.000Z' };

  it('names status changes and leaves other edits as updates', () => {
    expect(publishVerb(draft, live, { status: 'PUBLISHED' }, now)).toBe('published');
    expect(publishVerb(live, { ...live, status: 'DRAFT' }, { status: 'DRAFT' }, now)).toBe(
      'unpublished',
    );
    expect(publishVerb(live, live, { status: 'PUBLISHED' }, now)).toBe('updated');
    expect(publishVerb(draft, draft, {}, now)).toBe('updated');
  });

  it('calls publishing for a future date, or moving that date, scheduling', () => {
    expect(
      publishVerb(draft, future, { status: 'PUBLISHED', publishedAt: future.publishedAt }, now),
    ).toBe('scheduled');
    expect(
      publishVerb(
        future,
        { ...future, publishedAt: '2026-10-21T09:00:00.000Z' },
        {
          publishedAt: '2026-10-21T09:00:00.000Z',
        },
        now,
      ),
    ).toBe('scheduled');
    // Saving a scheduled item without touching its date is an ordinary edit.
    expect(publishVerb(future, future, { publishedAt: future.publishedAt }, now)).toBe('updated');
  });
});
