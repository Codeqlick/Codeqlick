import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CruisingNotificationsService } from './cruising-notifications.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { CruisingCommunityRepository } from './cruising-community.repository.js';
import { CruisingCommunityService } from './cruising-community.service.js';
import type { CruisingPushService } from './cruising-push.service.js';
import type { CruisingRepository } from './cruising.repository.js';
import type { CruisingSocialService } from './cruising-social.service.js';

const NOW = new Date('2026-11-16T12:00:00Z');
const VERSION = '2026-11-16.1';
const ME = '11111111-1111-4111-8111-111111111111';
const HOST = '22222222-2222-4222-8222-222222222222';
const OTHER = '66666666-6666-4666-8666-666666666666';
const SPOT = '33333333-3333-4333-8333-333333333333';
const MEETUP = '44444444-4444-4444-8444-444444444444';
const ALERT = '55555555-5555-4555-8555-555555555555';
const SECRET_NAME = 'Secret Cove Of Dreams';
const hours = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);

const profile = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  termsVersion: VERSION,
  suspendedAt: null,
  suspendedUntil: null,
  nickname: 'me_myself',
  country: 'ES',
  ...over,
});

const member = (nickname: string, over: Record<string, unknown> = {}) => ({
  cruisingProfile: {
    nickname,
    verificationStatus: 'NONE',
    suspendedAt: null,
    suspendedUntil: null,
    ...over,
  },
});

const meetupRow = (over: Record<string, unknown> = {}) => ({
  id: MEETUP,
  spotId: SPOT,
  hostId: HOST,
  title: 'Sunset walk',
  description: '',
  startsAt: hours(2),
  endsAt: hours(4),
  capacity: null,
  status: 'LIVE',
  createdAt: NOW,
  spot: {
    id: SPOT,
    slug: 'cove',
    name: SECRET_NAME,
    city: 'Madrid',
    citySlug: 'madrid',
    countryCode: 'ES',
    status: 'LIVE',
  },
  host: member('the_host', { verificationStatus: 'APPROVED' }),
  attendees: [],
  ...over,
});

const citySpot = (id: string) => ({
  id,
  slug: id,
  name: id,
  type: 'PARK',
  lat: 1,
  lng: 2,
  ratingAvg: 4,
  ratingCount: 1,
});

function build() {
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    findSpot: vi
      .fn()
      .mockResolvedValue({ id: SPOT, slug: 'cove', name: SECRET_NAME, status: 'LIVE' }),
    hiddenIds: vi.fn().mockResolvedValue([]),
    citySpots: vi.fn().mockResolvedValue([]),
    hereAt: vi.fn().mockResolvedValue(new Map()),
  };
  const community = {
    findMeetup: vi.fn().mockResolvedValue(meetupRow()),
    upcomingMeetups: vi.fn().mockResolvedValue([]),
    countMeetupsSince: vi.fn().mockResolvedValue(0),
    createMeetup: vi
      .fn()
      .mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve(meetupRow({ ...data, hostId: ME, host: member('me_myself') })),
      ),
    attend: vi.fn().mockResolvedValue('ok'),
    leave: vi.fn().mockResolvedValue(undefined),
    setMeetupStatus: vi.fn().mockResolvedValue(undefined),
    attendeeRecipients: vi.fn().mockResolvedValue([]),
    favoriteSpotIds: vi.fn().mockResolvedValue([SPOT]),
    tripCountries: vi.fn().mockResolvedValue(['PT']),
    liveCity: vi.fn().mockResolvedValue('Madrid'),
    countUpcomingTrips: vi.fn().mockResolvedValue(0),
    createTrip: vi
      .fn()
      .mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve({ id: 'trip-1', ...data }),
      ),
    myTrips: vi.fn().mockResolvedValue([]),
    deleteTrip: vi.fn().mockResolvedValue(true),
    visitors: vi.fn().mockResolvedValue([]),
    countSafetyAlertsSince: vi.fn().mockResolvedValue(0),
    createSafetyAlert: vi
      .fn()
      .mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve({ id: ALERT, ...data }),
      ),
    findSafetyAlert: vi.fn().mockResolvedValue({
      id: ALERT,
      posterId: OTHER,
      hidden: false,
      createdAt: NOW,
      expiresAt: hours(6),
      spot: { id: SPOT, status: 'LIVE' },
    }),
    activeSafetyAlerts: vi.fn().mockResolvedValue([]),
    vote: vi.fn().mockResolvedValue(true),
    countVotes: vi.fn().mockResolvedValue(1),
    setSafetyExpiry: vi.fn().mockResolvedValue(undefined),
    safetyInBox: vi.fn().mockResolvedValue([]),
    deleteMeetupsEndedBefore: vi.fn().mockResolvedValue(0),
    deleteTripsEndedBefore: vi.fn().mockResolvedValue(0),
    deleteSafetyAlertsExpiredBefore: vi.fn().mockResolvedValue(0),
    deleteRoomMessagesBefore: vi.fn().mockResolvedValue(0),
  };
  const social = { alertFavorites: vi.fn().mockResolvedValue(2) };
  const push = { enabled: true, notify: vi.fn().mockResolvedValue(1) };
  const sent: MailMessage[] = [];
  const mail = {
    send: vi.fn().mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const config = {
    isTest: true,
    cruisingTermsVersion: VERSION,
    siteUrl: 'https://codeqlick.com',
    webappUrl: () => 'https://cruising.codeqlick.com',
  };
  const notifications = {
    notify: vi.fn().mockResolvedValue(undefined),
    notifyMany: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CruisingCommunityService(
    community as unknown as CruisingCommunityRepository,
    repo as unknown as CruisingRepository,
    social as unknown as CruisingSocialService,
    push as unknown as CruisingPushService,
    mail as unknown as MailService,
    config as unknown as AppConfigService,
    notifications as unknown as CruisingNotificationsService,
  );
  return { service, repo, community, social, push, sent, notifications };
}

const newMeetup = (over: Record<string, unknown> = {}) => ({
  spotId: SPOT,
  startsAt: hours(3).toISOString(),
  hours: 2,
  title: 'Sunset walk',
  description: '',
  capacity: null,
  ...over,
});

describe('CruisingCommunityService: meetups', () => {
  it('needs entry, a nickname and no suspension to plan one', async () => {
    const { service, repo } = build();
    repo.findProfile.mockResolvedValueOnce(null);
    await expect(service.createMeetup(ME, newMeetup(), NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    repo.findProfile.mockResolvedValueOnce(profile({ nickname: null }));
    await expect(service.createMeetup(ME, newMeetup(), NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    repo.findProfile.mockResolvedValueOnce(profile({ suspendedAt: NOW, suspendedUntil: null }));
    await expect(service.createMeetup(ME, newMeetup(), NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses times out of range, shared contacts and a fourth in a week', async () => {
    const { service, community } = build();
    await expect(
      service.createMeetup(ME, newMeetup({ startsAt: hours(0.25).toISOString() }), NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createMeetup(ME, newMeetup({ startsAt: hours(31 * 24).toISOString() }), NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createMeetup(ME, newMeetup({ description: 'text me on +34 600 123 456' }), NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    community.countMeetupsSince.mockResolvedValueOnce(3);
    await expect(service.createMeetup(ME, newMeetup(), NOW)).rejects.toBeInstanceOf(HttpException);
    expect(community.createMeetup).not.toHaveBeenCalled();
  });

  it('plans one and alerts the members who saved the spot, after answering', async () => {
    const { service, community, social } = build();
    const view = await service.createMeetup(ME, newMeetup({ capacity: 5 }), NOW);
    expect(view).toMatchObject({ title: 'Sunset walk', mine: true, going: 0, capacity: 5 });
    expect(community.createMeetup).toHaveBeenCalledWith(
      expect.objectContaining({ endsAt: hours(5), hostId: ME }),
    );
    await service.idle();
    expect(social.alertFavorites).toHaveBeenCalledWith(SPOT, ME, NOW, 'meetup');
  });

  it('counts attendees but names only the non-anonymous, never the hidden or suspended', async () => {
    const { service, community, repo } = build();
    repo.hiddenIds.mockResolvedValue([OTHER]);
    community.upcomingMeetups.mockResolvedValue([
      meetupRow({
        capacity: 4,
        attendees: [
          { userId: 'a', anonymous: false, user: member('named_one') },
          { userId: 'b', anonymous: true, user: member('secret_one') },
          { userId: OTHER, anonymous: false, user: member('blocked_one') },
          {
            userId: 'c',
            anonymous: false,
            user: member('suspended_one', { suspendedAt: NOW, suspendedUntil: null }),
          },
          { userId: ME, anonymous: true, user: member('me_myself') },
        ],
      }),
    ]);
    const { items } = await service.meetups(ME, { spotId: SPOT }, NOW);
    expect(items[0]).toMatchObject({
      going: 3,
      full: true,
      mine: false,
      attending: { anonymous: true },
      host: { nickname: 'the_host', verified: true },
      attendees: [{ nickname: 'named_one', verified: false }],
    });
    expect(JSON.stringify(items)).not.toContain('blocked_one');
    expect(JSON.stringify(items)).not.toContain('secret_one');
  });

  it('lists, with no filter, my favourites, my countries and the ones I am in', async () => {
    const { service, community } = build();
    await service.meetups(ME, {}, NOW);
    expect(community.upcomingMeetups).toHaveBeenCalledWith(
      { spotIds: [SPOT], countries: ['ES', 'PT'], memberId: ME },
      NOW,
      [],
      100,
    );
  });

  it('refuses joining when full, over, my own, or hosted by someone hidden', async () => {
    const { service, community, repo } = build();
    community.attend.mockResolvedValueOnce('full');
    await expect(service.attend(ME, MEETUP, false, NOW)).rejects.toBeInstanceOf(ConflictException);
    community.findMeetup.mockResolvedValueOnce(meetupRow({ endsAt: NOW }));
    await expect(service.attend(ME, MEETUP, false, NOW)).rejects.toBeInstanceOf(ConflictException);
    community.findMeetup.mockResolvedValueOnce(meetupRow({ hostId: ME }));
    await expect(service.attend(ME, MEETUP, false, NOW)).rejects.toBeInstanceOf(ConflictException);
    repo.hiddenIds.mockResolvedValueOnce([HOST]);
    await expect(service.attend(ME, MEETUP, false, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await service.attend(ME, MEETUP, true, NOW);
    expect(community.attend).toHaveBeenLastCalledWith(MEETUP, ME, true, null, NOW);
  });

  it('lets only the host cancel, and tells attendees without naming anything', async () => {
    const { service, community, push, sent, notifications } = build();
    await expect(service.cancelMeetup(ME, MEETUP, NOW)).rejects.toBeInstanceOf(NotFoundException);
    community.findMeetup.mockResolvedValue(meetupRow({ hostId: ME }));
    community.attendeeRecipients.mockResolvedValue([
      {
        id: 'p',
        email: 'push@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: true, suspendedAt: null, suspendedUntil: null },
        _count: { cruisingPushSubscriptions: 1 },
      },
      {
        id: 'e',
        email: 'mail@example.com',
        locale: 'ES',
        cruisingProfile: { emailAlerts: true, suspendedAt: null, suspendedUntil: null },
        _count: { cruisingPushSubscriptions: 0 },
      },
      {
        id: 'n',
        email: 'quiet@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: false, suspendedAt: null, suspendedUntil: null },
        _count: { cruisingPushSubscriptions: 0 },
      },
    ]);
    await service.cancelMeetup(ME, MEETUP, NOW);
    expect(community.setMeetupStatus).toHaveBeenCalledWith(MEETUP, 'CANCELLED');
    await service.idle();
    expect(push.notify).toHaveBeenCalledWith('meetup-cancelled', [{ userId: 'p', locale: 'en' }]);
    expect(sent.map((message) => message.to)).toEqual(['mail@example.com']);
    // The centre hears of it too, even with neither push nor email (decision 98).
    expect(notifications.notifyMany).toHaveBeenCalledWith(
      ['p', 'e', 'n'],
      'MEETUP_CANCELLED',
      { meetupId: MEETUP },
      NOW,
    );
    expect(JSON.stringify(sent)).not.toContain(SECRET_NAME);
    expect(JSON.stringify(sent)).not.toContain('Sunset walk');
  });
});

describe('CruisingCommunityService: trips', () => {
  const trip = { countryCode: 'ES' as const, citySlug: 'madrid', listed: true };

  it('needs a city with LIVE spots, dates in range and at most 3 upcoming', async () => {
    const { service, community } = build();
    community.liveCity.mockResolvedValueOnce(null);
    await expect(
      service.createTrip(ME, { ...trip, from: '2026-11-20', to: '2026-11-22' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createTrip(ME, { ...trip, from: '2026-11-15', to: '2026-11-22' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createTrip(ME, { ...trip, from: '2026-11-20', to: '2026-12-10' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    community.countUpcomingTrips.mockResolvedValueOnce(3);
    await expect(
      service.createTrip(ME, { ...trip, from: '2026-11-20', to: '2026-11-22' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    const created = await service.createTrip(
      ME,
      { ...trip, from: '2026-11-20', to: '2026-11-22' },
      NOW,
    );
    expect(created).toMatchObject({ city: 'Madrid', from: '2026-11-20', to: '2026-11-22' });
  });

  it('lists visitors without me or the hidden, with their badge', async () => {
    const { service, community, repo } = build();
    repo.hiddenIds.mockResolvedValue([OTHER]);
    community.visitors.mockResolvedValue([
      {
        userId: 'v',
        startsOn: new Date('2026-11-20T00:00:00Z'),
        endsOn: new Date('2026-11-22T00:00:00Z'),
        user: member('visitor', { verificationStatus: 'APPROVED' }),
      },
    ]);
    const { items } = await service.visitors(ME, 'ES', 'madrid', NOW);
    expect(items).toEqual([
      { nickname: 'visitor', verified: true, from: '2026-11-20', to: '2026-11-22' },
    ]);
    const [, , from, until, exclude, version] = community.visitors.mock.calls[0] as unknown[];
    expect(from).toEqual(new Date('2026-11-16T00:00:00Z'));
    expect(until).toEqual(new Date('2027-01-15T00:00:00Z'));
    expect(exclude).toEqual([ME, OTHER]);
    expect(version).toBe(VERSION);
  });

  it('shows the busiest spots of the city on the trip card', async () => {
    const { service, community, repo } = build();
    community.myTrips.mockResolvedValue([
      {
        id: 'trip-1',
        countryCode: 'ES',
        citySlug: 'madrid',
        city: 'Madrid',
        startsOn: new Date('2026-11-17T00:00:00Z'),
        endsOn: new Date('2026-11-18T00:00:00Z'),
        listed: false,
      },
    ]);
    repo.citySpots.mockResolvedValue([citySpot('quiet'), citySpot('busy')]);
    repo.hereAt.mockResolvedValue(new Map([['busy', 4]]));
    community.upcomingMeetups.mockResolvedValue([
      meetupRow(),
      meetupRow({ id: 'later', startsAt: hours(24 * 10), endsAt: hours(24 * 10 + 2) }),
    ]);
    const { items } = await service.trips(ME, NOW);
    expect(items[0]?.spots.map((item) => [item.id, item.here])).toEqual([
      ['busy', 4],
      ['quiet', 0],
    ]);
    // Only the meetups during the trip.
    expect(items[0]?.meetups.map((item) => item.id)).toEqual([]);
  });

  it('deletes only my trips', async () => {
    const { service, community } = build();
    community.deleteTrip.mockResolvedValueOnce(false);
    await expect(service.deleteTrip(ME, 'trip-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CruisingCommunityService: safety alerts', () => {
  it('posts one (5 a day, contact filter) and alerts savers', async () => {
    const { service, community, social } = build();
    await expect(
      service.createSafetyAlert(ME, SPOT, { kind: 'OTHER', note: 'see instagram.com/x' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    community.countSafetyAlertsSince.mockResolvedValueOnce(5);
    await expect(
      service.createSafetyAlert(ME, SPOT, { kind: 'POLICE', note: null }, NOW),
    ).rejects.toBeInstanceOf(HttpException);
    const view = await service.createSafetyAlert(ME, SPOT, { kind: 'CLOSED', note: null }, NOW);
    expect(view).toMatchObject({ kind: 'CLOSED', mine: true, confirmations: 0 });
    expect(view.expiresAt).toBe(hours(7 * 24).toISOString());
    await service.idle();
    expect(social.alertFavorites).toHaveBeenCalledWith(SPOT, ME, NOW, 'safety');
  });

  it('never says who posted an alert', async () => {
    const { service, community } = build();
    community.activeSafetyAlerts.mockResolvedValue([
      {
        id: ALERT,
        kind: 'THEFT',
        note: 'Bags taken',
        posterId: OTHER,
        createdAt: NOW,
        expiresAt: hours(6),
        _count: { votes: 2 },
        votes: [{ kind: 'CONFIRM' }],
      },
    ]);
    const { items } = await service.safetyAlerts(ME, SPOT, NOW);
    expect(items[0]).toEqual({
      id: ALERT,
      kind: 'THEFT',
      note: 'Bags taken',
      createdAt: NOW.toISOString(),
      expiresAt: hours(6).toISOString(),
      confirmations: 2,
      mine: false,
      myVote: 'CONFIRM',
    });
    expect(JSON.stringify(items)).not.toContain(OTHER);
  });

  it('extends on confirm, ends on the third gone, once per member, never one’s own', async () => {
    const { service, community } = build();
    await service.voteSafetyAlert(ME, ALERT, 'CONFIRM', NOW);
    expect(community.setSafetyExpiry).toHaveBeenLastCalledWith(ALERT, hours(9));
    community.countVotes.mockResolvedValueOnce(2);
    await service.voteSafetyAlert(ME, ALERT, 'GONE', NOW);
    expect(community.setSafetyExpiry).toHaveBeenCalledTimes(1);
    community.countVotes.mockResolvedValueOnce(3);
    await service.voteSafetyAlert(ME, ALERT, 'GONE', NOW);
    expect(community.setSafetyExpiry).toHaveBeenLastCalledWith(ALERT, NOW);
    community.vote.mockResolvedValueOnce(false);
    await expect(service.voteSafetyAlert(ME, ALERT, 'CONFIRM', NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    community.findSafetyAlert.mockResolvedValueOnce({
      id: ALERT,
      posterId: ME,
      hidden: false,
      createdAt: NOW,
      expiresAt: hours(6),
      spot: { id: SPOT, status: 'LIVE' },
    });
    await expect(service.voteSafetyAlert(ME, ALERT, 'CONFIRM', NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    community.findSafetyAlert.mockResolvedValueOnce({
      id: ALERT,
      posterId: OTHER,
      hidden: false,
      createdAt: NOW,
      expiresAt: NOW,
      spot: { id: SPOT, status: 'LIVE' },
    });
    await expect(service.voteSafetyAlert(ME, ALERT, 'GONE', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers the map only for entered members', async () => {
    const { service, repo } = build();
    repo.findProfile.mockResolvedValueOnce(null);
    await expect(
      service.safetyInBox(ME, { minLng: 0, minLat: 0, maxLng: 0.25, maxLat: 0.25 }, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cleans up what is over', async () => {
    const { service, community } = build();
    await service.cleanup(NOW);
    expect(community.deleteMeetupsEndedBefore).toHaveBeenCalledWith(hours(-7 * 24));
    expect(community.deleteTripsEndedBefore).toHaveBeenCalledWith(new Date('2026-11-16T00:00:00Z'));
    expect(community.deleteSafetyAlertsExpiredBefore).toHaveBeenCalledWith(hours(-24));
    expect(community.deleteRoomMessagesBefore).toHaveBeenCalledWith(hours(-7 * 24));
  });
});
