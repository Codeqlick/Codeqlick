import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { CruisingMediaRepository } from './cruising-media.repository.js';
import type { CruisingRoomsRepository } from './cruising-rooms.repository.js';
import { PERMANENT_MUTE } from './cruising-rooms.rules.js';
import { CruisingRoomsService } from './cruising-rooms.service.js';
import type { CruisingRepository } from './cruising.repository.js';

const VERSION = 'v-test';
const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-16T12:00:00Z');
const ROOM = { countryCode: 'ES', citySlug: 'madrid' };
const ADMIN = { id: 'admin', role: 'ADMIN' } as AuthUser;
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

const profile = (overrides: Record<string, unknown> = {}) => ({
  userId: ME,
  termsVersion: VERSION,
  nickname: 'pier_fan',
  country: 'ES',
  suspendedAt: null,
  suspendedUntil: null,
  roomMutedUntil: null,
  ...overrides,
});

const row = (id: string, userId: string, text = 'Hello') => ({
  id,
  userId,
  countryCode: 'ES',
  citySlug: 'madrid',
  text,
  hidden: false,
  createdAt: NOW,
  user: { cruisingProfile: { nickname: userId === ME ? 'pier_fan' : 'beach_guy' } },
});

function build() {
  const rooms = {
    roomCity: vi.fn().mockResolvedValue('Madrid'),
    accountCreatedAt: vi.fn().mockResolvedValue(hoursAgo(48)),
    messages: vi.fn().mockResolvedValue([row('m1', THEM), row('m2', ME)]),
    countPostedSince: vi.fn().mockResolvedValue(0),
    create: vi
      .fn()
      .mockImplementation((data: { text: string }) => Promise.resolve(row('new', ME, data.text))),
    findMessage: vi.fn().mockResolvedValue(row('m1', THEM)),
    deleteMessage: vi.fn().mockResolvedValue(true),
    closeOpenReportsOnRoomMessage: vi.fn().mockResolvedValue(undefined),
    favoriteCities: vi.fn().mockResolvedValue([]),
    tripCities: vi.fn().mockResolvedValue([]),
    busiestCities: vi.fn().mockResolvedValue([]),
    liveCities: vi.fn().mockResolvedValue(new Set()),
    roomStats: vi
      .fn()
      .mockImplementation((list: object[]) =>
        Promise.resolve(list.map((room) => ({ ...room, lastAt: null, count24h: 0 }))),
      ),
  };
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    hiddenIds: vi.fn().mockResolvedValue([]),
    updateProfile: vi.fn().mockResolvedValue(undefined),
  };
  const mediaRepo = {
    badges: vi.fn().mockResolvedValue(new Map([[THEM, { verified: true, coverId: null }]])),
  };
  const activity = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new CruisingRoomsService(
    rooms as unknown as CruisingRoomsRepository,
    repo as unknown as CruisingRepository,
    mediaRepo as unknown as CruisingMediaRepository,
    activity as unknown as ActivityService,
    { cruisingTermsVersion: VERSION } as unknown as AppConfigService,
  );
  return { service, rooms, repo, activity };
}

describe('CruisingRoomsService (decision 100)', () => {
  describe('reading a room', () => {
    it('lists the messages with the badge, marks mine and says I may post', async () => {
      const { service, rooms } = build();
      const result = await service.messages(ME, ROOM, undefined, NOW);
      expect(result.items).toEqual([
        {
          id: 'm1',
          nickname: 'beach_guy',
          verified: true,
          text: 'Hello',
          at: NOW.toISOString(),
          mine: false,
        },
        {
          id: 'm2',
          nickname: 'pier_fan',
          verified: false,
          text: 'Hello',
          at: NOW.toISOString(),
          mine: true,
        },
      ]);
      expect(result.posting).toEqual({ allowed: true, reason: null, until: null });
      expect(rooms.messages).toHaveBeenCalledWith(ROOM, undefined, [], NOW);
    });

    it('passes my blocks so their messages are hidden, and `after`', async () => {
      const { service, rooms, repo } = build();
      repo.hiddenIds.mockResolvedValueOnce([THEM]);
      await service.messages(ME, ROOM, '2026-11-16T11:00:00.000Z', NOW);
      expect(rooms.messages).toHaveBeenCalledWith(
        ROOM,
        new Date('2026-11-16T11:00:00.000Z'),
        [THEM],
        NOW,
      );
    });

    it('is only for cities with LIVE spots and for entered members', async () => {
      const { service, rooms, repo } = build();
      rooms.roomCity.mockResolvedValueOnce(null);
      await expect(service.messages(ME, ROOM, undefined, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      repo.findProfile.mockResolvedValueOnce(null);
      await expect(service.messages(ME, ROOM, undefined, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('says why I can’t post and until when', async () => {
      const { service, rooms, repo } = build();
      rooms.accountCreatedAt.mockResolvedValueOnce(hoursAgo(2));
      expect((await service.messages(ME, ROOM, undefined, NOW)).posting).toEqual({
        allowed: false,
        reason: 'new-account',
        until: hoursAgo(-22).toISOString(),
      });
      repo.findProfile.mockResolvedValueOnce(profile({ roomMutedUntil: PERMANENT_MUTE }));
      expect((await service.messages(ME, ROOM, undefined, NOW)).posting).toEqual({
        allowed: false,
        reason: 'muted',
        until: PERMANENT_MUTE.toISOString(),
      });
    });
  });

  describe('posting', () => {
    it('posts a message', async () => {
      const { service, rooms } = build();
      const view = await service.post(ME, ROOM, 'Anyone around tonight?', NOW);
      expect(view).toMatchObject({ id: 'new', mine: true, text: 'Anyone around tonight?' });
      expect(rooms.create).toHaveBeenCalledWith({
        countryCode: 'ES',
        citySlug: 'madrid',
        userId: ME,
        text: 'Anyone around tonight?',
        createdAt: NOW,
      });
    });

    it('refuses accounts under 24 hours, muted, suspended and nickname-less members', async () => {
      const { service, rooms, repo } = build();
      rooms.accountCreatedAt.mockResolvedValueOnce(hoursAgo(23));
      await expect(service.post(ME, ROOM, 'Hi', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      repo.findProfile.mockResolvedValueOnce(profile({ roomMutedUntil: hoursAgo(-1) }));
      await expect(service.post(ME, ROOM, 'Hi', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      repo.findProfile.mockResolvedValueOnce(profile({ suspendedAt: hoursAgo(1) }));
      await expect(service.post(ME, ROOM, 'Hi', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      repo.findProfile.mockResolvedValueOnce(profile({ nickname: null }));
      await expect(service.post(ME, ROOM, 'Hi', NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(rooms.create).not.toHaveBeenCalled();
    });

    it('always refuses contact details and links', async () => {
      const { service, rooms } = build();
      await expect(service.post(ME, ROOM, 'whatsapp me 612345678', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.post(ME, ROOM, 'see example.de/x', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(rooms.create).not.toHaveBeenCalled();
    });

    it('allows 10 a minute and 200 a day', async () => {
      const { service, rooms } = build();
      rooms.countPostedSince.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
      await expect(service.post(ME, ROOM, 'Hi', NOW)).rejects.toBeInstanceOf(HttpException);
      rooms.countPostedSince.mockResolvedValueOnce(0).mockResolvedValueOnce(200);
      await expect(service.post(ME, ROOM, 'Hi', NOW)).rejects.toMatchObject({ status: 429 });
      expect(rooms.create).not.toHaveBeenCalled();
    });
  });

  it('lists my favourites’ cities, my live trips’ cities and my country’s busiest, once each', async () => {
    const { service, rooms } = build();
    const city = (citySlug: string) => ({ countryCode: 'ES', citySlug, city: citySlug });
    rooms.favoriteCities.mockResolvedValueOnce([city('madrid')]);
    rooms.tripCities.mockResolvedValueOnce([city('bilbao'), city('nowhere')]);
    rooms.liveCities.mockResolvedValueOnce(new Set(['ES/bilbao']));
    rooms.busiestCities.mockResolvedValueOnce([city('madrid'), city('sevilla')]);
    const { items } = await service.myRooms(ME, NOW);
    expect(items.map((item) => item.citySlug)).toEqual(['bilbao', 'madrid', 'sevilla']);
    expect(rooms.busiestCities).toHaveBeenCalledWith('ES', NOW);
  });

  describe('the team', () => {
    it('deletes a message, settling its reports', async () => {
      const { service, rooms, activity } = build();
      await service.deleteMessage(ADMIN, 'm1', NOW);
      expect(rooms.closeOpenReportsOnRoomMessage).toHaveBeenCalledWith('m1', 'admin', NOW);
      expect(rooms.deleteMessage).toHaveBeenCalledWith('m1');
      expect(activity.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({ action: 'cruising.room_message_deleted' }),
      );
      rooms.findMessage.mockResolvedValueOnce(null);
      await expect(service.deleteMessage(ADMIN, 'gone', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('mutes for a while or for good, and unmutes', async () => {
      const { service, repo } = build();
      await service.mute(ADMIN, THEM, '7d', NOW);
      expect(repo.updateProfile).toHaveBeenCalledWith(THEM, { roomMutedUntil: hoursAgo(-7 * 24) });
      await service.mute(ADMIN, THEM, 'permanent', NOW);
      expect(repo.updateProfile).toHaveBeenCalledWith(THEM, { roomMutedUntil: PERMANENT_MUTE });
      repo.findProfile.mockResolvedValueOnce(profile({ roomMutedUntil: PERMANENT_MUTE }));
      await service.unmute(ADMIN, THEM, NOW);
      expect(repo.updateProfile).toHaveBeenLastCalledWith(THEM, { roomMutedUntil: null });
      await expect(service.unmute(ADMIN, THEM, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
