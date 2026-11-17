import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { AdultMigrationService } from '../src/modules/adult/adult-migration.service.js';
import { emailHash } from '../src/modules/adult/adult.rules.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { SwipeStorage } from '../src/modules/swipe/swipe.storage.js';
import { SWIPE_TERMS_VERSION } from '../src/modules/swipe/swipe.schemas.js';
import { VIDEOCHAT_TERMS_VERSION } from '../src/modules/videochat/videochat.schemas.js';
import { VideochatService } from '../src/modules/videochat/videochat.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 6);
const HOUR = 60 * 60 * 1000;

type Person = {
  id: string;
  email: string;
  name: string;
  auth: { Authorization: string; 'X-Forwarded-For': string };
};

/** A photo with a pattern of its own. */
function photo(seed: number): Promise<Buffer> {
  return sharp({
    create: { width: 48, height: 48, channels: 3, background: { r: seed * 40, g: 90, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

describe('18+ apps: shared safety (e2e, architecture 4.16 phase 1)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Person;
  let cruisingVersion: string;
  const sent: MailMessage[] = [];
  let made = 0;

  const server = () => app.getHttpServer();

  async function person(label: string, role: Role = Role.CLIENT, email?: string): Promise<Person> {
    made += 1;
    const name = `${label.toLowerCase().slice(0, 5)}_${tag}_${made}`;
    const address = email ?? `e2e-adult-${name}@codeqlick.test`;
    const user = await prisma.user.create({
      data: { email: address, name: label, role, passwordHash: 'x', username: name },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email: address, name: label, role });
    return {
      id: user.id,
      email: address,
      name,
      auth: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': `10.91.${made}.1` },
    };
  }

  /** Entered in the three apps with their current terms; the name is the username (and nickname). */
  async function member(label: string, apps = ['CRUISING', 'SWIPE', 'VIDEOCHAT']) {
    const who = await person(label);
    const now = new Date();
    if (apps.includes('CRUISING')) {
      await prisma.cruisingProfile.create({
        data: {
          userId: who.id,
          birthYear: 1990,
          termsVersion: cruisingVersion,
          acceptedAt: now,
          nickname: who.name,
        },
      });
    }
    if (apps.includes('SWIPE')) {
      await prisma.swipeProfile.create({
        data: {
          userId: who.id,
          adultConfirmedAt: now,
          termsVersion: SWIPE_TERMS_VERSION,
          termsAcceptedAt: now,
          nickname: who.name,
        },
      });
    }
    if (apps.includes('VIDEOCHAT')) {
      await prisma.videochatProfile.create({
        data: {
          userId: who.id,
          adultConfirmedAt: now,
          termsVersion: VIDEOCHAT_TERMS_VERSION,
          termsAcceptedAt: now,
          nickname: who.name,
        },
      });
    }
    return who;
  }

  const blockRows = async (a: string, b: string) => ({
    cruising: await prisma.cruisingBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: a, blockedId: b } },
    }),
    swipe: await prisma.swipeBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: a, blockedId: b } },
    }),
    videochat: await prisma.videochatBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: a, blockedId: b } },
    }),
  });

  /** A Swipe match, a Cruising conversation, album grants and video chat likes between two. */
  async function together(a: Person, b: Person) {
    const [userAId, userBId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const match = await prisma.swipeMatch.create({ data: { userAId, userBId } });
    await prisma.swipeMessage.create({ data: { matchId: match.id, senderId: a.id, text: 'hola' } });
    await prisma.cruisingConversation.create({ data: { userAId, userBId, starterId: a.id } });
    await prisma.cruisingAlbumGrant.createMany({
      data: [
        { ownerId: a.id, granteeId: b.id },
        { ownerId: b.id, granteeId: a.id },
      ],
    });
    await prisma.videochatLike.createMany({
      data: [
        { fromId: a.id, toId: b.id },
        { fromId: b.id, toId: a.id },
      ],
    });
    return { match, userAId, userBId };
  }

  async function nothingBetween(userAId: string, userBId: string) {
    expect(await prisma.swipeMatch.count({ where: { userAId, userBId } })).toBe(0);
    expect(await prisma.cruisingConversation.count({ where: { userAId, userBId } })).toBe(0);
    expect(
      await prisma.cruisingAlbumGrant.count({
        where: { ownerId: { in: [userAId, userBId] }, granteeId: { in: [userAId, userBId] } },
      }),
    ).toBe(0);
    expect(
      await prisma.videochatLike.count({
        where: { fromId: { in: [userAId, userBId] }, toId: { in: [userAId, userBId] } },
      }),
    ).toBe(0);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    cruisingVersion = app.get(AppConfigService).cruisingTermsVersion;
    vi.spyOn(app.get(MailService), 'send').mockImplementation(async (message) => {
      sent.push(message);
    });
    admin = await person('Admin', Role.ADMIN);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('blocks (decision 112)', () => {
    it('a block made in any app applies in the three, with its side effects', async () => {
      const ana = await member('Ana');
      const bea = await member('Bea');
      const { match, userAId, userBId } = await together(ana, bea);

      // Blocked from a Swipe match.
      await request(server()).post(`/v1/swipe/matches/${match.id}/block`).set(ana.auth).expect(204);
      const rows = await blockRows(ana.id, bea.id);
      expect(rows.cruising?.sourceApp).toBe('SWIPE');
      expect(rows.swipe?.sourceApp).toBe('SWIPE');
      expect(rows.videochat?.sourceApp).toBe('SWIPE');
      await nothingBetween(userAId, userBId);
      // Bea is hidden from Ana in Cruising and can't be matched with her in the video chat.
      expect(await app.get(VideochatService).blockedUserIds(bea.id)).toContain(ana.id);

      // The list names each person in the asking app; lifting it in Cruising lifts it everywhere.
      const list = await request(server())
        .get('/v1/adult/blocks?app=CRUISING')
        .set(ana.auth)
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({ name: bea.name, sourceApp: 'SWIPE' }),
      ]);
      expect(JSON.stringify(list.body)).not.toContain(bea.id);
      await request(server()).delete(`/v1/cruising/blocks/${bea.name}`).set(ana.auth).expect(204);
      expect(await blockRows(ana.id, bea.id)).toEqual({
        cruising: null,
        swipe: null,
        videochat: null,
      });
    });

    it('blocks from Cruising and the video chat too; lifting by reference lifts all', async () => {
      const cai = await member('Cai');
      const dan = await member('Dan', ['CRUISING', 'VIDEOCHAT']);
      await request(server())
        .post('/v1/cruising/blocks')
        .set(cai.auth)
        .send({ nickname: dan.name })
        .expect(204);
      expect((await blockRows(cai.id, dan.id)).swipe?.sourceApp).toBe('CRUISING');
      // Swipe names nobody (Dan has no Swipe name): "A member of another 18+ app".
      const list = await request(server())
        .get('/v1/adult/blocks?app=SWIPE')
        .set(cai.auth)
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({ name: null, sourceApp: 'CRUISING' }),
      ]);
      await request(server())
        .delete(`/v1/adult/blocks/${list.body.items[0].ref}`)
        .set(cai.auth)
        .expect(204);
      await request(server())
        .delete(`/v1/adult/blocks/${list.body.items[0].ref}`)
        .set(cai.auth)
        .expect(404);
      expect((await blockRows(cai.id, dan.id)).cruising).toBeNull();

      // From a video chat call (the gateway goes through the same service).
      await app.get(VideochatService).block(dan.id, cai.id);
      const rows = await blockRows(dan.id, cai.id);
      expect([rows.cruising?.sourceApp, rows.swipe?.sourceApp]).toEqual(['VIDEOCHAT', 'VIDEOCHAT']);
      await request(server()).get('/v1/adult/blocks?app=VIDEOCHAT').expect(401);
    });
  });

  describe('one verification (decision 113)', () => {
    it('approved once from Swipe, the badge shows in the three apps; the photo is kept for the team', async () => {
      const eva = await member('Eva');
      const sentPhoto = await request(server())
        .post('/v1/adult/verification?app=SWIPE')
        .set(eva.auth)
        .attach('file', await photo(1), 'me.jpg')
        .expect(201);
      expect(sentPhoto.body).toMatchObject({
        status: 'PENDING',
        sourceApp: 'SWIPE',
        hasPhoto: true,
      });
      // Waiting already: once.
      await request(server())
        .post('/v1/adult/verification?app=CRUISING')
        .set(eva.auth)
        .attach('file', await photo(2), 'me.jpg')
        .expect(409);
      await request(server()).get('/v1/adult/verification/file').set(eva.auth).expect(200);

      // One queue: the same row in the three admins.
      for (const path of [
        '/v1/admin/adult/verifications',
        '/v1/admin/cruising/verifications',
        '/v1/admin/swipe/verifications',
        '/v1/admin/videochat/verifications',
      ]) {
        const queue = await request(server()).get(path).set(admin.auth).expect(200);
        expect(queue.body.items).toContainEqual(
          expect.objectContaining({ userId: eva.id, verifiedName: eva.name, sourceApp: 'SWIPE' }),
        );
      }
      await request(server()).get('/v1/admin/adult/verifications').set(eva.auth).expect(403);
      await request(server())
        .post(`/v1/admin/cruising/verifications/${eva.id}`)
        .set(admin.auth)
        .send({ approve: true })
        .expect(204);
      // Decided in one, decided for all.
      await request(server())
        .post(`/v1/admin/swipe/verifications/${eva.id}`)
        .set(admin.auth)
        .send({ approve: false })
        .expect(404);

      const [cruising, swipe, videochat] = await Promise.all(
        ['cruising', 'swipe', 'videochat'].map((app) =>
          request(server()).get(`/v1/${app}/me`).set(eva.auth).expect(200),
        ),
      );
      expect(cruising.body.verified).toBe(true);
      expect(swipe.body.verification.status).toBe('APPROVED');
      expect(swipe.body.canUpload).toBe(true);
      expect(videochat.body.verification.status).toBe('APPROVED');
      expect(sent.map((mail) => mail.subject)).toContain(
        "You are verified in Codeqlick's 18+ apps",
      );
      for (const mail of sent) expect(mail.text).not.toContain(eva.name);

      // The approved photo stays, for the team only.
      const row = await prisma.adultVerification.findUniqueOrThrow({ where: { userId: eva.id } });
      const file = join(app.get(AppConfigService).swipeUploadsDir, 'verification', row.photoKey!);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      await request(server())
        .get(`/v1/admin/adult/verifications/${eva.id}/file`)
        .set(admin.auth)
        .expect(200);
      await request(server())
        .get(`/v1/admin/adult/verifications/${eva.id}/file`)
        .set(eva.auth)
        .expect(403);
      await request(server()).get('/v1/adult/verification/file').set(eva.auth).expect(404);

      // Withdrawn by the team: gone in the three, the photo deleted, the person told.
      sent.length = 0;
      await request(server())
        .delete(`/v1/admin/adult/users/${eva.id}/verification`)
        .set(admin.auth)
        .send({ reason: 'Stolen photo report' })
        .expect(204);
      await expect(readFile(file)).rejects.toThrow(/ENOENT/);
      expect((await request(server()).get('/v1/cruising/me').set(eva.auth)).body.verified).toBe(
        false,
      );
      expect(
        (await request(server()).get('/v1/swipe/me').set(eva.auth)).body.verification.status,
      ).toBe('NONE');
      expect(sent.map((mail) => mail.subject)).toEqual([
        "Your verification in Codeqlick's 18+ apps was withdrawn",
      ]);
      const panel = await request(server())
        .get(`/v1/admin/adult/users/${eva.id}`)
        .set(admin.auth)
        .expect(200);
      expect(
        panel.body.verification.history.map((entry: { action: string }) => entry.action),
      ).toEqual(['adult.verification_withdrawn', 'adult.verification_decided']);
    });

    it('goes when the name on the paper is no longer one of the account', async () => {
      const fay = await member('Fay', ['CRUISING']);
      // Her username is another name: the paper shows her Cruising nickname.
      await prisma.user.update({ where: { id: fay.id }, data: { username: `fay_user_${tag}` } });
      await request(server())
        .post('/v1/adult/verification?app=CRUISING')
        .set(fay.auth)
        .attach('file', await photo(3), 'me.jpg')
        .expect(201);
      await request(server())
        .post(`/v1/admin/adult/verifications/${fay.id}`)
        .set(admin.auth)
        .send({ approve: true })
        .expect(204);
      await request(server())
        .patch('/v1/cruising/profile')
        .set(fay.auth)
        .send({ nickname: `fay_new_${tag}` })
        .expect(200);
      expect(
        (await prisma.adultVerification.findUniqueOrThrow({ where: { userId: fay.id } })).status,
      ).toBe('NONE');
    });

    it('stays while the name on the paper is still the username', async () => {
      const gia = await member('Gia', ['CRUISING', 'SWIPE']);
      await request(server())
        .post('/v1/adult/verification?app=SWIPE')
        .set(gia.auth)
        .attach('file', await photo(4), 'me.jpg')
        .expect(201);
      await request(server())
        .post(`/v1/admin/adult/verifications/${gia.id}`)
        .set(admin.auth)
        .send({ approve: true })
        .expect(204);
      await request(server())
        .patch('/v1/cruising/profile')
        .set(gia.auth)
        .send({ nickname: `gia_new_${tag}` })
        .expect(200);
      expect(
        (await prisma.adultVerification.findUniqueOrThrow({ where: { userId: gia.id } })).status,
      ).toBe('APPROVED');
    });
  });

  describe('serious suspensions (decision 114)', () => {
    it('MINOR, NON_CONSENSUAL and ILLEGAL apply in the three apps with the same end', async () => {
      const gus = await member('Gus', ['SWIPE', 'VIDEOCHAT']);
      await request(server())
        .post(`/v1/admin/swipe/users/${gus.id}/suspend`)
        .set(admin.auth)
        .send({ reason: 'Non-consensual photo', duration: '7d', category: 'NON_CONSENSUAL' })
        .expect(204);
      const shared = await prisma.adultSuspension.findFirstOrThrow({ where: { userId: gus.id } });
      expect(shared).toMatchObject({ category: 'NON_CONSENSUAL', sourceApp: 'SWIPE' });
      const swipe = await prisma.swipeProfile.findUniqueOrThrow({ where: { userId: gus.id } });
      const videochat = await prisma.videochatProfile.findUniqueOrThrow({
        where: { userId: gus.id },
      });
      expect(swipe.suspendedUntil).toEqual(shared.until);
      expect(videochat.suspendedUntil).toEqual(shared.until);
      // Even in an app never entered: Cruising says so before entry, and entering keeps it.
      const before = await request(server()).get('/v1/cruising/me').set(gus.auth).expect(200);
      expect(before.body).toMatchObject({ suspended: true, allowed: false });
      await request(server())
        .put('/v1/cruising/me')
        .set(gus.auth)
        .send({
          birthDate: '1990-01-01',
          acceptTerms: true,
          consentSpecialData: true,
          termsVersion: cruisingVersion,
        })
        .expect(200);
      const cruising = await prisma.cruisingProfile.findUniqueOrThrow({
        where: { userId: gus.id },
      });
      expect(cruising.suspendedUntil).toEqual(shared.until);
      // The email names no app.
      const mail = sent.find((message) => message.to === gus.email);
      expect(mail?.subject).toBe("Your access to Codeqlick's 18+ apps is suspended");
      expect(mail?.text).not.toMatch(/Swipe|Cruising|Videochat|video chat/);

      // The panel shows it; lifting it from another admin lifts it in the three.
      const panel = await request(server())
        .get(`/v1/admin/adult/users/${gus.id}`)
        .set(admin.auth)
        .expect(200);
      expect(panel.body.sharedSuspensions[0]).toMatchObject({
        category: 'NON_CONSENSUAL',
        sourceApp: 'SWIPE',
        active: true,
      });
      expect(panel.body.apps.map((entry: { suspension: unknown }) => !!entry.suspension)).toEqual([
        true,
        true,
        true,
      ]);
      await request(server())
        .delete(`/v1/admin/cruising/users/${gus.id}/suspension`)
        .set(admin.auth)
        .expect(204);
      for (const model of [prisma.swipeProfile, prisma.videochatProfile, prisma.cruisingProfile]) {
        const profile = await (
          model as unknown as {
            findUniqueOrThrow: (args: object) => Promise<{ suspendedAt: Date | null }>;
          }
        ).findUniqueOrThrow({ where: { userId: gus.id } });
        expect(profile.suspendedAt).toBeNull();
      }
      expect(
        (await prisma.adultSuspension.findFirstOrThrow({ where: { userId: gus.id } })).liftedAt,
      ).not.toBeNull();
    });

    it('other categories stay in their app', async () => {
      const hal = await member('Hal');
      await request(server())
        .post(`/v1/admin/swipe/users/${hal.id}/suspend`)
        .set(admin.auth)
        .send({ reason: 'Spam links', duration: '24h', category: 'SPAM' })
        .expect(204);
      await request(server())
        .post(`/v1/admin/swipe/users/${hal.id}/suspend`)
        .set(admin.auth)
        .send({ reason: 'Spam links', duration: '24h' })
        .expect(400);
      expect(await prisma.adultSuspension.count({ where: { userId: hal.id } })).toBe(0);
      expect((await request(server()).get('/v1/swipe/me').set(hal.auth)).body.suspended).toBe(true);
      expect((await request(server()).get('/v1/cruising/me').set(hal.auth)).body.suspended).toBe(
        false,
      );
      expect((await request(server()).get('/v1/videochat/me').set(hal.auth)).body.suspended).toBe(
        false,
      );
    });

    it('an automatic suspension waits for a moderator before it is shared', async () => {
      const ivo = await member('Ivo');
      const rep = await member('Rep', ['VIDEOCHAT']);
      await app.get(VideochatService).report({
        reporterId: rep.id,
        reportedId: ivo.id,
        reason: 'MINOR',
        transcript: [],
      });
      expect((await request(server()).get('/v1/videochat/me').set(ivo.auth)).body.suspended).toBe(
        true,
      );
      expect((await request(server()).get('/v1/swipe/me').set(ivo.auth)).body.suspended).toBe(
        false,
      );
      expect(await prisma.adultSuspension.count({ where: { userId: ivo.id } })).toBe(0);

      // The report list marks people reported in the other apps.
      await prisma.swipeReport.create({
        data: { reporterId: rep.id, reportedId: ivo.id, reason: 'HARASSMENT' },
      });
      const reports = await request(server())
        .get('/v1/admin/videochat/reports?status=OPEN')
        .set(admin.auth)
        .expect(200);
      const report = reports.body.find(
        (item: { reported: { id: string } }) => item.reported.id === ivo.id,
      );
      expect(report.reported.alsoReported).toEqual({ apps: ['SWIPE'], open: 1 });

      // The team acts on it: the report's MINOR shares it in the three apps.
      await request(server())
        .post(`/v1/admin/videochat/reports/${report.id}/suspend`)
        .set(admin.auth)
        .send({ duration: '30d' })
        .expect(204);
      const shared = await prisma.adultSuspension.findFirstOrThrow({ where: { userId: ivo.id } });
      expect(shared).toMatchObject({
        category: 'MINOR',
        sourceApp: 'VIDEOCHAT',
        reportId: report.id,
      });
      expect((await request(server()).get('/v1/swipe/me').set(ivo.auth)).body.suspended).toBe(true);
      expect((await request(server()).get('/v1/cruising/me').set(ivo.auth)).body.suspended).toBe(
        true,
      );
    });
  });

  describe('no coming back with a new account (decision 120)', () => {
    it('keeps an email hash after deleting a seriously suspended account; entry is refused', async () => {
      const gmail = `jo.e2e.${tag}@gmail.com`;
      const jo = await member('Jo', ['SWIPE']);
      await prisma.user.update({ where: { id: jo.id }, data: { email: gmail } });
      const other = await member('Kai', ['SWIPE']);
      await request(server())
        .post(`/v1/admin/adult/users/${jo.id}/suspension`)
        .set(admin.auth)
        .send({
          category: 'ILLEGAL',
          sourceApp: 'SWIPE',
          reason: 'Illegal content',
          duration: 'permanent',
        })
        .expect(204);
      await request(server()).delete(`/v1/admin/users/${jo.id}`).set(admin.auth).expect(204);

      const key = app.get(AppConfigService).adultBanHashKey;
      const ban = await prisma.adultBannedEmail.findFirstOrThrow({
        where: { emailHash: emailHash(key, gmail) },
      });
      expect(ban.category).toBe('ILLEGAL');
      expect(ban.expiresAt.getTime() - ban.createdAt.getTime()).toBeGreaterThan(729 * 24 * HOUR);
      // Nothing readable is kept.
      expect(JSON.stringify(ban)).not.toContain('jo.e2e');

      // A new account with the same Gmail (dots and a +tag) can't enter any adult app.
      const again = await person(
        'Jo2',
        Role.CLIENT,
        `J.O.E2E.${tag}+again@gmail.com`.toLowerCase(),
      );
      const entry = {
        birthDate: '1990-01-01',
        acceptTerms: true,
        consentSpecialData: true,
      };
      const refused = await request(server())
        .put('/v1/swipe/me')
        .set(again.auth)
        .send({ ...entry, termsVersion: SWIPE_TERMS_VERSION })
        .expect(403);
      expect(JSON.stringify(refused.body)).toContain("can't use Codeqlick's 18+ apps");
      await request(server())
        .put('/v1/videochat/me')
        .set(again.auth)
        .send({ ...entry, termsVersion: VIDEOCHAT_TERMS_VERSION })
        .expect(403);
      await request(server())
        .put('/v1/cruising/me')
        .set(again.auth)
        .send({ ...entry, termsVersion: cruisingVersion })
        .expect(403);
      // Other accounts are unaffected.
      await request(server())
        .put('/v1/swipe/me')
        .set(other.auth)
        .send({ ...entry, termsVersion: SWIPE_TERMS_VERSION })
        .expect(200);

      // An accepted appeal by email: the team deletes the hash (logged without the address).
      await request(server())
        .delete('/v1/admin/adult/banned-emails')
        .set(admin.auth)
        .send({ email: gmail })
        .expect(204);
      await request(server())
        .put('/v1/swipe/me')
        .set(again.auth)
        .send({ ...entry, termsVersion: SWIPE_TERMS_VERSION })
        .expect(200);
    });

    it('a deleted account without a serious suspension leaves nothing', async () => {
      const lu = await member('Lu', ['SWIPE']);
      await request(server()).delete(`/v1/admin/users/${lu.id}`).set(admin.auth).expect(204);
      expect(
        await prisma.adultBannedEmail.count({
          where: { emailHash: emailHash(app.get(AppConfigService).adultBanHashKey, lu.email) },
        }),
      ).toBe(0);
    });
  });

  describe("phase 1's migration", () => {
    /** The data part of the Prisma migration, run again over rows seeded the old way. */
    async function runDataMigration() {
      const sql = await readFile(
        join(
          import.meta.dirname,
          '../prisma/migrations/20261117170000_adult_shared_safety/migration.sql',
        ),
        'utf8',
      );
      const data = sql.slice(sql.indexOf('-- ---- Data migration'));
      const statements = data
        .split(/;\s*\n/)
        .map((statement) =>
          statement
            .split('\n')
            .filter((line) => !line.trim().startsWith('--'))
            .join('\n')
            .trim(),
        )
        .filter((statement) => statement.length > 0);
      for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    }

    it('copies blocks, merges verifications (approval wins) and lists serious suspensions', async () => {
      const mia = await member('Mia');
      const ned = await member('Ned');
      const oli = await member('Oli', ['SWIPE', 'VIDEOCHAT']);
      const pia = await member('Pia', ['CRUISING', 'VIDEOCHAT']);
      const { userAId, userBId } = await together(mia, ned);
      // An old Cruising block (no sourceApp), with the match and likes it didn't end then.
      await prisma.cruisingBlock.create({ data: { blockerId: mia.id, blockedId: ned.id } });

      // Oli: approved in Swipe (photo kept there), pending in the video chat.
      const swipeStorage = app.get(SwipeStorage);
      const approvedKey = await swipeStorage.write(await photo(7));
      await prisma.swipeProfile.update({
        where: { userId: oli.id },
        data: {
          verificationStatus: 'APPROVED',
          verificationKey: approvedKey,
          verifiedAt: new Date(Date.now() - 48 * HOUR),
        },
      });
      await prisma.videochatProfile.update({
        where: { userId: oli.id },
        data: { verificationStatus: 'PENDING', verificationSentAt: new Date() },
      });
      // Pia: rejected in Cruising, then pending in the video chat (newest wins over rejected).
      await prisma.cruisingProfile.update({
        where: { userId: pia.id },
        data: {
          verificationStatus: 'REJECTED',
          verificationNote: 'Blurry',
          verificationSentAt: new Date(Date.now() - 24 * HOUR),
        },
      });
      await prisma.videochatProfile.update({
        where: { userId: pia.id },
        data: { verificationStatus: 'PENDING', verificationSentAt: new Date() },
      });
      // Ned: suspended in Swipe after an ACTIONED MINOR report.
      const suspendedAt = new Date(Date.now() - HOUR);
      await prisma.swipeProfile.update({
        where: { userId: ned.id },
        data: { suspendedAt, suspendedUntil: null, suspensionReason: 'Report: MINOR' },
      });
      await prisma.swipeReport.create({
        data: { reporterId: mia.id, reportedId: ned.id, reason: 'MINOR', status: 'ACTIONED' },
      });

      await runDataMigration();
      await runDataMigration(); // idempotent
      const rows = await blockRows(mia.id, ned.id);
      expect(rows.cruising?.sourceApp).toBeNull();
      expect(rows.swipe?.sourceApp).toBe('CRUISING');
      expect(rows.videochat?.sourceApp).toBe('CRUISING');

      const oliRow = await prisma.adultVerification.findUniqueOrThrow({
        where: { userId: oli.id },
      });
      expect(oliRow).toMatchObject({
        status: 'APPROVED',
        sourceApp: 'SWIPE',
        verifiedName: oli.name,
      });
      const piaRow = await prisma.adultVerification.findUniqueOrThrow({
        where: { userId: pia.id },
      });
      expect(piaRow).toMatchObject({ status: 'PENDING', sourceApp: 'VIDEOCHAT' });

      // The one-off task: the kept photo moves, the rest goes, the blocked pairs are cleared.
      const result = await app.get(AdultMigrationService).run();
      expect(result.photos).toBeGreaterThanOrEqual(1);
      await nothingBetween(userAId, userBId);
      const moved = await prisma.adultVerification.findUniqueOrThrow({ where: { userId: oli.id } });
      expect(moved.photoKey).toBeTruthy();
      expect(await swipeStorage.size(approvedKey)).toBeUndefined();
      expect(
        (await prisma.swipeProfile.findUniqueOrThrow({ where: { userId: oli.id } }))
          .verificationKey,
      ).toBeNull();
      await request(server())
        .get(`/v1/admin/adult/verifications/${oli.id}/file`)
        .set(admin.auth)
        .expect(200);
      expect((await app.get(AdultMigrationService).run()).pairs).toBe(0);

      // Listed once for the team; nothing shared automatically.
      expect(await prisma.adultSuspension.count({ where: { userId: ned.id } })).toBe(0);
      const review = await request(server())
        .get('/v1/admin/adult/review-suspensions')
        .set(admin.auth)
        .expect(200);
      expect(review.body.items).toContainEqual(
        expect.objectContaining({
          app: 'SWIPE',
          userId: ned.id,
          reportReason: 'MINOR',
          until: null,
        }),
      );
      await request(server())
        .post(`/v1/admin/adult/review-suspensions/SWIPE/${ned.id}/share`)
        .set(admin.auth)
        .expect(204);
      const shared = await prisma.adultSuspension.findFirstOrThrow({ where: { userId: ned.id } });
      expect(shared).toMatchObject({ category: 'MINOR', sourceApp: 'SWIPE', until: null });
      expect(
        (await prisma.cruisingProfile.findUniqueOrThrow({ where: { userId: ned.id } })).suspendedAt,
      ).toEqual(shared.createdAt);
      await request(server())
        .post(`/v1/admin/adult/review-suspensions/SWIPE/${ned.id}/keep`)
        .set(admin.auth)
        .expect(404);
      const after = await request(server())
        .get('/v1/admin/adult/review-suspensions')
        .set(admin.auth)
        .expect(200);
      expect(after.body.items.some((item: { userId: string }) => item.userId === ned.id)).toBe(
        false,
      );
    });
  });
});
