import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import { CruisingAlbumService } from './cruising-album.service.js';
import type { CruisingMediaRepository } from './cruising-media.repository.js';
import type { CruisingPushService } from './cruising-push.service.js';
import type { CruisingRepository } from './cruising.repository.js';

const VERSION = 'v-test';
const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-16T12:00:00Z');

const profile = (overrides: Record<string, unknown> = {}) => ({
  userId: ME,
  termsVersion: VERSION,
  nickname: 'pier_fan',
  suspendedAt: null,
  suspendedUntil: null,
  ...overrides,
});

function build() {
  const media = {
    grant: vi.fn().mockResolvedValue(true),
    revoke: vi.fn().mockResolvedValue(undefined),
    grantsOf: vi.fn().mockResolvedValue([[], []]),
  };
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    findProfileByNickname: vi
      .fn()
      .mockResolvedValue(profile({ userId: THEM, nickname: 'beach_guy' })),
    hiddenIds: vi.fn().mockResolvedValue([]),
    findConversationBetween: vi.fn().mockResolvedValue({ id: 'conversation' }),
    recipient: vi.fn().mockResolvedValue({
      id: THEM,
      locale: 'ES',
      cruisingProfile: { suspendedAt: null, suspendedUntil: null },
    }),
  };
  const push = { enabled: true, notify: vi.fn().mockResolvedValue(1) };
  const service = new CruisingAlbumService(
    media as unknown as CruisingMediaRepository,
    repo as unknown as CruisingRepository,
    push as unknown as CruisingPushService,
    { cruisingTermsVersion: VERSION } as unknown as AppConfigService,
  );
  return { service, media, repo, push };
}

describe('CruisingAlbumService (decision 99)', () => {
  it('shares my private album with someone I talk to and tells them once', async () => {
    const { service, media, push } = build();
    await service.share(ME, 'beach_guy', NOW);
    await service.settled();
    expect(media.grant).toHaveBeenCalledWith(ME, THEM, NOW);
    expect(push.notify).toHaveBeenCalledWith('album', [{ userId: THEM, locale: 'es' }]);

    media.grant.mockResolvedValueOnce(false);
    push.notify.mockClear();
    await service.share(ME, 'beach_guy', NOW);
    await service.settled();
    expect(push.notify).not.toHaveBeenCalled();
  });

  it('needs a conversation between us', async () => {
    const { service, repo, media } = build();
    repo.findConversationBetween.mockResolvedValueOnce(null);
    await expect(service.share(ME, 'beach_guy', NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(media.grant).not.toHaveBeenCalled();
  });

  it('refuses blocked, suspended, unknown people and myself', async () => {
    const { service, repo } = build();
    repo.hiddenIds.mockResolvedValueOnce([THEM]);
    await expect(service.share(ME, 'beach_guy', NOW)).rejects.toBeInstanceOf(NotFoundException);
    repo.findProfileByNickname.mockResolvedValueOnce(
      profile({ userId: THEM, suspendedAt: NOW, suspendedUntil: null }),
    );
    await expect(service.share(ME, 'beach_guy', NOW)).rejects.toBeInstanceOf(NotFoundException);
    repo.findProfileByNickname.mockResolvedValueOnce(null);
    await expect(service.share(ME, 'nobody', NOW)).rejects.toBeInstanceOf(NotFoundException);
    repo.findProfileByNickname.mockResolvedValueOnce(profile());
    await expect(service.share(ME, 'pier_fan', NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('needs my entry, my nickname and no suspension', async () => {
    const { service, repo } = build();
    repo.findProfile.mockResolvedValueOnce(profile({ termsVersion: 'old' }));
    await expect(service.share(ME, 'beach_guy', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    repo.findProfile.mockResolvedValueOnce(profile({ suspendedAt: NOW }));
    await expect(service.share(ME, 'beach_guy', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    repo.findProfile.mockResolvedValueOnce(profile({ nickname: null }));
    await expect(service.share(ME, 'beach_guy', NOW)).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes, whether shared or not', async () => {
    const { service, media } = build();
    await service.revoke(ME, 'beach_guy');
    expect(media.revoke).toHaveBeenCalledWith(ME, THEM);
  });

  it('lists the grants given and received, leaving out suspended owners', async () => {
    const { service, media } = build();
    const at = new Date('2026-11-16T10:00:00Z');
    const person = (nickname: string, suspendedAt: Date | null = null) => ({
      cruisingProfile: { nickname, suspendedAt, suspendedUntil: null },
    });
    media.grantsOf.mockResolvedValueOnce([
      [{ granteeId: THEM, createdAt: at, grantee: person('beach_guy') }],
      [
        { ownerId: THEM, createdAt: at, owner: person('beach_guy') },
        { ownerId: 'x', createdAt: at, owner: person('gone', NOW) },
      ],
    ]);
    expect(await service.grants(ME, NOW)).toEqual({
      given: [{ nickname: 'beach_guy', at: at.toISOString() }],
      received: [{ nickname: 'beach_guy', at: at.toISOString() }],
    });
  });
});
