import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { CruisingMediaRepository } from './cruising-media.repository.js';
import type { CruisingMediaService } from './cruising-media.service.js';
import type { CruisingRoomsRepository } from './cruising-rooms.repository.js';
import type { CruisingRepository } from './cruising.repository.js';
import { CruisingService } from './cruising.service.js';
import {
  boxAround,
  distanceMeters,
  findDuplicate,
  parseSpotsCsv,
  parseSpotsGeojson,
  splitCsv,
  spotTypeFromLabel,
} from './cruising.rules.js';

describe('spotTypeFromLabel', () => {
  it('takes the enum or its English or Spanish label, any case and accents', () => {
    expect(spotTypeFromLabel('BEACH')).toBe('BEACH');
    expect(spotTypeFromLabel('rest_area')).toBe('REST_AREA');
    expect(spotTypeFromLabel('Rest area')).toBe('REST_AREA');
    expect(spotTypeFromLabel('ÁREA DE DESCANSO')).toBe('REST_AREA');
    expect(spotTypeFromLabel('area de descanso')).toBe('REST_AREA');
    expect(spotTypeFromLabel(' playa ')).toBe('BEACH');
    expect(spotTypeFromLabel('Bosque o monte')).toBe('FOREST');
    expect(spotTypeFromLabel('bar or club')).toBe('BAR_CLUB');
    expect(spotTypeFromLabel('Cine')).toBe('CINEMA');
    expect(spotTypeFromLabel('Otro')).toBe('OTHER');
  });

  it('knows nothing else', () => {
    expect(spotTypeFromLabel('Swimming pool')).toBeNull();
    expect(spotTypeFromLabel('')).toBeNull();
  });
});

describe('splitCsv', () => {
  it('reads quoted fields with separators, doubled quotes and line breaks', () => {
    expect(splitCsv('a,b\n"x, y","say ""hi""\nthere"\n3,4')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['x, y', 'say "hi"\nthere'] },
      { line: 4, cells: ['3', '4'] },
    ]);
  });

  it('takes semicolons when the header has more, CRLF and a BOM, and skips blank lines', () => {
    expect(splitCsv('﻿a;b\r\n\r\n1,5;2\r\n')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 3, cells: ['1,5', '2'] },
    ]);
  });

  it('refuses a quote never closed', () => {
    expect(splitCsv('a,b\n"open,1')).toBeNull();
  });
});

const HEADER = 'name,type,lat,lng,countryCode,city,description,bestTimes';

describe('parseSpotsCsv', () => {
  it('maps the columns in any order, labels and lower-case countries, numbered by line', () => {
    const csv = [
      '﻿City;Description;Lat;Lng;Name;Type;Country Code',
      'Madrid;"Quiet; shady";40,41678;-3.70379;Casa de Campo;Parque;es',
      '',
      'Sitges;Beach end;41.23;1.81;Playa del Muerto;beach;ES',
    ].join('\n');
    expect(parseSpotsCsv(csv)).toEqual({
      ok: true,
      rows: [
        {
          row: 2,
          fields: {
            name: 'Casa de Campo',
            type: 'PARK',
            lat: 40.41678,
            lng: -3.70379,
            countryCode: 'ES',
            city: 'Madrid',
            description: 'Quiet; shady',
            bestTimes: null,
            tags: [],
            openingHours: null,
            tips: null,
          },
        },
        {
          row: 4,
          fields: expect.objectContaining({ type: 'BEACH', lat: 41.23, lng: 1.81 }),
        },
      ],
    });
  });

  it('keeps an unknown type and an empty coordinate for the checks to refuse', () => {
    const result = parseSpotsCsv(`${HEADER}\nX,Pool,,2,ES,C,D,evenings`);
    expect(result.ok && result.rows[0]?.fields).toMatchObject({
      type: 'Pool',
      lat: Number.NaN,
      lng: 2,
      bestTimes: 'evenings',
    });
  });

  it('refuses a header without the required columns, an empty file or a broken quote', () => {
    expect(parseSpotsCsv('name,type,lat\nA,BEACH,1')).toEqual({
      ok: false,
      error: 'The header row lacks the columns lng, countryCode, city, description',
    });
    expect(parseSpotsCsv('﻿\n\n')).toMatchObject({ ok: false });
    expect(parseSpotsCsv(`${HEADER}\n"A,BEACH`)).toMatchObject({ ok: false });
  });

  it('reads the phase 5 columns: tags separated by |, as the enum or a label', () => {
    const csv = [
      `${HEADER},tags,opening hours,tips`,
      'A,BEACH,1,2,ES,C,D,,nudist | PARKING|De noche|Aparcamiento,Summer only,Go left',
      'B,BEACH,1,2,ES,C,D,,Sauna,,',
    ].join('\n');
    const result = parseSpotsCsv(csv);
    expect(result.ok && result.rows[0]?.fields).toMatchObject({
      tags: ['NUDIST', 'PARKING', 'NIGHT', 'PARKING'],
      openingHours: 'Summer only',
      tips: 'Go left',
    });
    // An unknown tag is kept for the checks to refuse; empty optional cells are null.
    expect(result.ok && result.rows[1]?.fields).toMatchObject({
      tags: ['Sauna'],
      openingHours: null,
      tips: null,
    });
  });
});

describe('parseSpotsGeojson', () => {
  const feature = (geometry: unknown, properties: Record<string, unknown> = {}) => ({
    type: 'Feature',
    geometry,
    properties,
  });

  it('takes Point features, coordinates from the geometry, numbered from 0', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        feature(
          { type: 'Point', coordinates: [-3.7, 40.4] },
          {
            name: ' Casa de Campo ',
            type: 'Parque',
            countryCode: 'es',
            city: 'Madrid',
            description: 'Shady',
            lat: 99,
          },
        ),
        feature({ type: 'LineString', coordinates: [[0, 0]] }),
      ],
    });
    expect(parseSpotsGeojson(text)).toEqual({
      ok: true,
      rows: [
        {
          row: 0,
          fields: {
            name: 'Casa de Campo',
            type: 'PARK',
            lat: 40.4,
            lng: -3.7,
            countryCode: 'ES',
            city: 'Madrid',
            description: 'Shady',
            bestTimes: null,
            tags: [],
            openingHours: null,
            tips: null,
          },
        },
        { row: 1, fields: null, error: 'Not a Point feature' },
      ],
    });
  });

  it('refuses what is not JSON or not a FeatureCollection', () => {
    expect(parseSpotsGeojson('{nope')).toMatchObject({ ok: false });
    expect(parseSpotsGeojson('{"type":"Feature"}')).toMatchObject({ ok: false });
    expect(parseSpotsGeojson('[]')).toMatchObject({ ok: false });
  });
});

describe('distances and duplicates', () => {
  const madrid = { lat: 40.4168, lng: -3.7038 };

  it('measures great-circle distances', () => {
    expect(distanceMeters(madrid, madrid)).toBe(0);
    // 0.001° of latitude is about 111 m.
    expect(distanceMeters(madrid, { lat: 40.4178, lng: -3.7038 })).toBeCloseTo(111.2, 0);
    // Madrid to Barcelona, about 505 km.
    expect(Math.round(distanceMeters(madrid, { lat: 41.3874, lng: 2.1686 }) / 1000)).toBe(505);
  });

  it('draws a box that holds the circle', () => {
    const box = boxAround(madrid, 100);
    expect(madrid.lat + 0.0009).toBeLessThanOrEqual(box.maxLat);
    expect(madrid.lat - 0.0009).toBeGreaterThanOrEqual(box.minLat);
    // At 40° a degree of longitude is shorter: 100 m is about 0.00118°.
    expect(madrid.lng + 0.00117).toBeLessThanOrEqual(box.maxLng);
    expect(madrid.lng - 0.00117).toBeGreaterThanOrEqual(box.minLng);
    expect(box.maxLat - box.minLat).toBeLessThan(0.002);
    expect(boxAround({ lat: 90, lng: 0 }, 100)).toMatchObject({
      maxLat: 90,
      minLng: -180,
      maxLng: 180,
    });
  });

  it('finds a spot of the same type within 100 m', () => {
    const near = { id: 'near', type: 'PARK', lat: 40.4175, lng: -3.7038 }; // about 78 m
    const far = { id: 'far', type: 'PARK', lat: 40.418, lng: -3.7038 }; // about 133 m
    const otherType = { id: 'beach', type: 'BEACH', lat: 40.4168, lng: -3.7038 };
    expect(findDuplicate({ ...madrid, type: 'PARK' }, [otherType, far, near])).toBe(near);
    expect(findDuplicate({ ...madrid, type: 'PARK' }, [otherType, far])).toBeNull();
    expect(findDuplicate({ ...madrid, type: 'BEACH' }, [otherType])).toBe(otherType);
  });
});

const NOW = new Date('2026-11-16T12:00:00Z');
const admin: AuthUser = { id: 'a0', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' };

function build() {
  const repo = {
    slugTaken: vi.fn().mockResolvedValue(false),
    createSpot: vi
      .fn()
      .mockImplementation((data: { slug: string }) => Promise.resolve({ id: 'spot-1', ...data })),
    createSpots: vi.fn().mockResolvedValue([]),
    possibleDuplicates: vi.fn().mockResolvedValue([]),
  };
  const activity = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new CruisingService(
    repo as unknown as CruisingRepository,
    {} as unknown as CruisingMediaRepository,
    {} as unknown as CruisingMediaService,
    activity as unknown as ActivityService,
    { send: vi.fn() } as unknown as MailService,
    { isTest: true } as unknown as AppConfigService,
    {} as unknown as CruisingRoomsRepository,
  );
  return { service, repo, activity };
}

const spot = {
  name: 'Casa de Campo',
  type: 'PARK' as const,
  lat: 40.416775432,
  lng: -3.703790211,
  countryCode: 'ES' as const,
  city: 'Madrid',
  description: 'Shady paths.',
};

describe('team spots', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  it('creates a LIVE spot with no proposer and logs it', async () => {
    const result = await t.service.createTeamSpot(admin, { ...spot, publish: true }, NOW);
    expect(result).toEqual({ id: 'spot-1', slug: 'casa-de-campo', status: 'LIVE' });
    expect(t.repo.createSpot).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 40.41678,
        lng: -3.70379,
        citySlug: 'madrid',
        status: 'LIVE',
        createdById: null,
        reviewedAt: NOW,
      }),
    );
    expect(t.activity.record).toHaveBeenCalledWith(admin, {
      action: 'cruising.spot_created',
      targetId: 'spot-1',
      targetLabel: 'casa-de-campo',
      details: { status: 'LIVE' },
    });
  });

  it('leaves it PENDING, not reviewed, with publish false', async () => {
    const result = await t.service.createTeamSpot(admin, { ...spot, publish: false }, NOW);
    expect(result.status).toBe('PENDING');
    const data = t.repo.createSpot.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(data.status).toBe('PENDING');
    expect(data).not.toHaveProperty('reviewedAt');
  });
});

describe('importing spots', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  const csv = (...rows: string[]) =>
    ['name,type,lat,lng,countryCode,city,description', ...rows].join('\n');
  const run = (content: string, over: { dryRun?: boolean; publish?: boolean } = {}) =>
    t.service.importSpots(
      admin,
      { format: 'csv', content, publish: true, dryRun: false, ...over },
      NOW,
    );

  it('skips invalid rows and duplicates of earlier rows, and creates the rest at once', async () => {
    const result = await run(
      csv(
        'Casa de Campo,Parque,40.4168,-3.7038,ES,Madrid,Shady paths',
        'Too far north,PARK,95,1,ES,Madrid,Nope',
        'Casa de Campo bis,park,40.4170,-3.7038,ES,Madrid,The same place',
        'Casa de Campo beach,BEACH,40.4170,-3.7038,ES,Madrid,Another type',
        'Casa de Campo,PARK,41.4,2.1,XX,Barcelona,Bad country',
      ),
    );
    expect(result.created).toBe(2);
    expect(result.items).toEqual([
      { row: 2, name: 'Casa de Campo', city: 'Madrid', countryCode: 'ES', type: 'PARK' },
      { row: 5, name: 'Casa de Campo beach', city: 'Madrid', countryCode: 'ES', type: 'BEACH' },
    ]);
    expect(result.skipped).toEqual([
      { row: 3, reason: expect.stringMatching(/^lat: /) },
      { row: 4, reason: 'Duplicate of row 2 (within 100 m)' },
      { row: 6, reason: expect.stringMatching(/^countryCode: /) },
    ]);
    const rows = t.repo.createSpots.mock.calls[0]?.[0] as Record<string, unknown>[];
    expect(rows.map((row) => row.slug)).toEqual(['casa-de-campo', 'casa-de-campo-beach']);
    expect(rows.every((row) => row.status === 'LIVE' && row.createdById === null)).toBe(true);
    expect(t.activity.record).toHaveBeenCalledTimes(1);
    expect(t.activity.record).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: 'cruising.spots_imported',
        details: { created: 2, skipped: 3, format: 'csv', status: 'LIVE' },
      }),
    );
  });

  it('gives rows with the same name their own slugs', async () => {
    t.repo.slugTaken.mockImplementation((slug: string) => Promise.resolve(slug === 'dunes'));
    await run(
      csv('Dunes,BEACH,27.74,-15.57,ES,Maspalomas,One', 'Dunes,BEACH,28.5,-13.8,ES,Corralejo,Two'),
      { publish: false },
    );
    const rows = t.repo.createSpots.mock.calls[0]?.[0] as Record<string, unknown>[];
    expect(rows.map((row) => [row.slug, row.status])).toEqual([
      ['dunes-2', 'PENDING'],
      ['dunes-3', 'PENDING'],
    ]);
  });

  it('skips a duplicate of a spot already in the directory', async () => {
    t.repo.possibleDuplicates.mockResolvedValue([
      { id: 's', slug: 'old', name: 'Old park', type: 'PARK', lat: 40.4169, lng: -3.7038 },
    ]);
    const result = await run(csv('New park,PARK,40.4168,-3.7038,ES,Madrid,Shady'));
    expect(result).toEqual({
      created: 0,
      items: [],
      skipped: [{ row: 2, reason: 'Duplicate of "Old park" (within 100 m)' }],
    });
    expect(t.repo.possibleDuplicates).toHaveBeenCalledWith(expect.any(Object), 'PARK');
    expect(t.repo.createSpots).not.toHaveBeenCalled();
    expect(t.activity.record).not.toHaveBeenCalled();
  });

  it('creates nothing on a dry run', async () => {
    const result = await run(csv('Park,PARK,40.4,-3.7,ES,Madrid,Shady'), { dryRun: true });
    expect(result).toMatchObject({ created: 0, items: [{ row: 2, name: 'Park' }], skipped: [] });
    expect(t.repo.createSpots).not.toHaveBeenCalled();
    expect(t.activity.record).not.toHaveBeenCalled();
  });

  it('refuses an unreadable file, an empty one and more than 500 rows with 400', async () => {
    await expect(run('name;type\nA;B')).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(csv())).rejects.toBeInstanceOf(BadRequestException);
    const many = Array.from({ length: 501 }, (_, n) => `P${n},PARK,${n / 10},1,ES,C,D`);
    await expect(run(csv(...many))).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      t.service.importSpots(
        admin,
        { format: 'geojson', content: '{"type":"Feature"}', publish: true, dryRun: true },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
