import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';
import { adultRowsOfRealm, neoqlickCleanup } from '../src/scripts/neoqlick-cleanup.js';

// The cut-over's cleanup (architecture 4.18, decision 127) on a seeded database. It truncates the
// 18+ tables, so it only runs where that is harmless: CI, or a database whose name says it is
// throwaway (test, e2e or tmp). Never against a database holding real data.
const url = process.env.DATABASE_URL ?? '';
const database = url.split('/').pop()?.split('?')[0] ?? '';
const SAFE = process.env.CI === 'true' || /test|e2e|tmp/i.test(database);

describe.skipIf(!SAFE)('neoqlick-cleanup (e2e)', () => {
  const tag = randomUUID().slice(0, 8);
  const email = (key: string) => `e2e-clean-${key}-${tag}@codeqlick.test`;
  let prisma: PrismaClient;
  let root: string;
  let dirs: string[];
  let ids: Record<string, string>;

  const seed = async () => {
    const made: Record<string, string> = {};
    const user = async (
      key: string,
      data: {
        role?: Role;
        realm?: 'CODEQLICK' | 'NEOQLICK';
        signupApp?: string | null;
        registeredAt?: Date | null;
      } = {},
    ) => {
      const row = await prisma.user.create({
        data: {
          email: email(key),
          name: key,
          passwordHash: 'x',
          registeredAt: new Date(),
          ...data,
        },
      });
      made[key] = row.id;
      return row;
    };
    const joined = {
      adultConfirmedAt: new Date(),
      termsVersion: 'v1',
      termsAcceptedAt: new Date(),
    };
    // Exists only to use the apps: its apps' data goes, and the account with --delete-app-accounts.
    const only = await user('only', { signupApp: 'cruising' });
    await prisma.cruisingProfile.create({
      data: { userId: only.id, birthYear: 1990, termsVersion: 'v1', acceptedAt: new Date() },
    });
    await prisma.videochatProfile.create({ data: { userId: only.id, ...joined } });
    // Signed up from an app but is a client of the team (never registered): stays.
    await user('client', { signupApp: 'swipe', registeredAt: null });
    // The team's admin: stays in any case.
    await user('admin', { role: Role.ADMIN, signupApp: 'cruising' });
    await user('plain');
    await prisma.activityLog.createMany({
      data: [
        { actorName: 'Admin', action: 'cruising.spot_approved', targetType: 'cruising' },
        { actorName: 'Admin', action: 'swipe.photo_removed', targetType: 'swipe' },
        { actorName: 'Admin', action: 'post.published', targetType: 'post' },
      ].map((row) => ({ ...row, targetId: tag })),
    });
    for (const dir of dirs) {
      await mkdir(join(dir, 'incoming'), { recursive: true });
      await writeFile(join(dir, `${tag}.webp`), 'x');
      await writeFile(join(dir, 'incoming', `${tag}.part`), 'x');
    }
    ids = made;
  };

  // The shared test database may hold other tests' leftovers of NEOQLICK members: the safety
  // check that refuses them has its own test below.
  const force = true;
  const filesIn = async (dir: string) => (await readdir(dir)).length;
  const tagged = (action: string) =>
    prisma.activityLog.count({ where: { targetId: tag, targetType: action } });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    root = await mkdtemp(join(tmpdir(), 'cq-cleanup-'));
    dirs = [join(root, 'cruising'), join(root, 'swipe')];
  });

  beforeEach(async () => {
    await prisma.activityLog.deleteMany({ where: { targetId: tag } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
    await seed();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.activityLog.deleteMany({ where: { targetId: tag } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.$disconnect();
    }
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('counts by default and changes nothing', async () => {
    const report = await neoqlickCleanup(prisma, dirs, { apply: false, deleteAppAccounts: true });

    expect(report.applied).toBe(false);
    expect(report.tables.cruising_profiles).toBeGreaterThanOrEqual(1);
    expect(report.tables.videochat_profiles).toBeGreaterThanOrEqual(1);
    expect(report.rows).toBeGreaterThanOrEqual(2);
    expect(report.activityLogs).toBeGreaterThanOrEqual(2);
    expect(report.files).toBeGreaterThanOrEqual(4);
    expect(report.appAccounts.map((account) => account.id)).toEqual([ids.only]);
    expect(report.appAccountsDeleted).toBe(0);

    expect(await prisma.cruisingProfile.count({ where: { userId: ids.only } })).toBe(1);
    expect(await prisma.user.count({ where: { id: ids.only } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.client } })).signupApp).toBe(
      'swipe',
    );
    expect(await tagged('cruising')).toBe(1);
    for (const dir of dirs) expect(await filesIn(dir)).toBe(2);
  });

  it('deletes the 18+ rows, their activity log and the files, and keeps the accounts', async () => {
    const report = await neoqlickCleanup(prisma, dirs, {
      apply: true,
      deleteAppAccounts: false,
      force,
    });

    expect(report.applied).toBe(true);
    expect(report.appAccountsDeleted).toBe(0);
    const left: string[] = [];
    for (const table of Object.keys(report.tables)) {
      const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*) AS count FROM "${table}"`,
      );
      if (Number(row?.count) > 0) left.push(table);
    }
    expect(left).toEqual([]);
    // Only the 18+ moderation's log goes.
    expect(await tagged('cruising')).toBe(0);
    expect(await tagged('swipe')).toBe(0);
    expect(await tagged('post')).toBe(1);
    // The folders stay, empty.
    for (const dir of dirs) {
      expect((await stat(dir)).isDirectory()).toBe(true);
      expect(await filesIn(dir)).toBe(0);
    }
    // The accounts stay as plain Codeqlick accounts, with no 18+ signup app.
    for (const key of ['only', 'client', 'admin', 'plain']) {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: ids[key]! } });
      expect(row.realm).toBe('CODEQLICK');
      expect(row.signupApp).toBeNull();
    }
    expect(report.signupAppsCleared).toBeGreaterThanOrEqual(3);
  });

  it('deletes the accounts that exist only to use the apps with --delete-app-accounts', async () => {
    const report = await neoqlickCleanup(prisma, dirs, {
      apply: true,
      deleteAppAccounts: true,
      force,
    });

    expect(report.appAccountsDeleted).toBe(1);
    expect(await prisma.user.count({ where: { id: ids.only } })).toBe(0);
    // A client the team prepared, the admin and a plain account stay.
    for (const key of ['client', 'admin', 'plain']) {
      expect(await prisma.user.count({ where: { id: ids[key]! } })).toBe(1);
    }
  });

  it('is idempotent: a second run finds nothing and fails on nothing', async () => {
    await neoqlickCleanup(prisma, dirs, { apply: true, deleteAppAccounts: true, force });
    const again = await neoqlickCleanup(prisma, dirs, {
      apply: true,
      deleteAppAccounts: true,
      force,
    });

    expect(again.rows).toBe(0);
    expect(again.files).toBe(0);
    expect(again.activityLogs).toBe(0);
    expect(again.appAccounts).toEqual([]);
    expect(again.appAccountsDeleted).toBe(0);
  });

  it('leaves no 18+ row that references a CODEQLICK account (the integrity rule)', async () => {
    expect(await adultRowsOfRealm(prisma, 'CODEQLICK', `%-${tag}@%`)).toBeGreaterThanOrEqual(2);
    await neoqlickCleanup(prisma, dirs, { apply: true, deleteAppAccounts: false, force });
    expect(await adultRowsOfRealm(prisma, 'CODEQLICK', `%-${tag}@%`)).toBe(0);
  });

  it('refuses to apply once a NEOQLICK account has 18+ data, unless forced', async () => {
    const neo = await prisma.user.create({
      data: { email: email('neo'), realm: 'NEOQLICK', name: 'neo', passwordHash: 'x' },
    });
    await prisma.cruisingProfile.create({
      data: { userId: neo.id, birthYear: 1990, termsVersion: 'v1', acceptedAt: new Date() },
    });

    const dry = await neoqlickCleanup(prisma, dirs, { apply: false, deleteAppAccounts: false });
    expect(dry.neoqlickRows).toBeGreaterThanOrEqual(1);
    await expect(
      neoqlickCleanup(prisma, dirs, { apply: true, deleteAppAccounts: true }),
    ).rejects.toThrow(/belong to NEOQLICK accounts/);
    // Nothing was changed.
    expect(await prisma.cruisingProfile.count({ where: { userId: ids.only } })).toBe(1);
    expect(await prisma.user.count({ where: { id: ids.only } })).toBe(1);
    for (const dir of dirs) expect(await filesIn(dir)).toBe(2);

    await neoqlickCleanup(prisma, dirs, { apply: true, deleteAppAccounts: false, force: true });
    expect(await prisma.cruisingProfile.count({ where: { userId: neo.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: neo.id } })).toBe(1);
  });
});
