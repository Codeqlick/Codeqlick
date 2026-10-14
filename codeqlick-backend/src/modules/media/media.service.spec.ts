import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';
import type { MediaStorage } from './media.storage.js';

const OLD = '11111111-1111-4111-8111-111111111111.png';
const NEW = '22222222-2222-4222-8222-222222222222.jpg';

describe('MediaService', () => {
  let storage: {
    list: ReturnType<typeof vi.fn>;
    size: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let repository: { findUsage: ReturnType<typeof vi.fn> };
  let service: MediaService;

  beforeEach(() => {
    storage = {
      list: vi.fn().mockResolvedValue([
        { filename: OLD, size: 10, modifiedAt: new Date('2026-10-01T00:00:00Z') },
        { filename: 'notes.txt', size: 5, modifiedAt: new Date('2026-10-03T00:00:00Z') },
        { filename: NEW, size: 20, modifiedAt: new Date('2026-10-02T00:00:00Z') },
      ]),
      size: vi.fn().mockResolvedValue(10),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    repository = { findUsage: vi.fn().mockResolvedValue(new Map()) };
    service = new MediaService(
      storage as unknown as MediaStorage,
      repository as unknown as MediaRepository,
    );
  });

  it('lists only our images, newest first, with their usage', async () => {
    const usedBy = [{ type: 'post', id: 'p1', slug: 'hello' }];
    repository.findUsage.mockResolvedValue(new Map([[OLD, usedBy]]));

    const result = await service.list(1, 20);

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.filename)).toEqual([NEW, OLD]);
    expect(result.items[0]).toMatchObject({ contentType: 'image/jpeg', size: 20, usedBy: [] });
    expect(result.items[1]).toMatchObject({ contentType: 'image/png', usedBy });
  });

  it('only looks up usage for the requested page', async () => {
    const result = await service.list(2, 1);

    expect(result.items.map((item) => item.filename)).toEqual([OLD]);
    expect(repository.findUsage).toHaveBeenCalledWith([OLD]);
  });

  it('deletes an image nothing uses', async () => {
    repository.findUsage.mockResolvedValue(new Map([[OLD, []]]));

    await service.remove(OLD);

    expect(storage.remove).toHaveBeenCalledWith(OLD);
  });

  it('refuses to delete an image that is still used', async () => {
    repository.findUsage.mockResolvedValue(
      new Map([[OLD, [{ type: 'portfolio', id: 'c1', slug: 'circlesfera' }]]]),
    );

    await expect(service.remove(OLD)).rejects.toBeInstanceOf(ConflictException);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('never touches names it did not generate', async () => {
    await expect(service.remove('../../package.json')).rejects.toBeInstanceOf(NotFoundException);
    storage.size.mockResolvedValue(undefined);
    await expect(service.remove(OLD)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
