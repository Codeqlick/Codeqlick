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
  it('names status changes and leaves other edits as updates', () => {
    expect(publishVerb('DRAFT', 'PUBLISHED')).toBe('published');
    expect(publishVerb('PUBLISHED', 'DRAFT')).toBe('unpublished');
    expect(publishVerb('PUBLISHED', 'PUBLISHED')).toBe('updated');
    expect(publishVerb('DRAFT', undefined)).toBe('updated');
  });
});
