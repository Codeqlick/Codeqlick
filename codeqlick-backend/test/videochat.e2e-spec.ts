import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { VIDEOCHAT_TERMS_VERSION } from '../src/modules/videochat/videochat.schemas.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const ORIGIN = 'http://localhost:3000';
type Msg = { type: string; [key: string]: unknown };

/** A browser tab of the video chat: a socket plus the messages it received. */
class Tab {
  readonly inbox: Msg[] = [];
  private readonly closeCode: Promise<number>;
  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => this.inbox.push(JSON.parse(String(data)) as Msg));
    this.closeCode = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
  }

  static open(url: string, origin = ORIGIN): Promise<Tab> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { origin });
      const tab = new Tab(socket);
      socket.once('open', () => resolve(tab));
      socket.once('unexpected-response', (_req, res) =>
        reject(new Error(`HTTP ${res.statusCode}`)),
      );
      socket.once('error', reject);
    });
  }

  send(message: Msg): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Waits for the next message of `type` not seen yet, and consumes it. */
  async next(type: string): Promise<Msg> {
    let found: Msg | undefined;
    await vi.waitFor(
      () => {
        const index = this.inbox.findIndex((m) => m.type === type);
        if (index === -1) throw new Error(`no ${type}; got ${JSON.stringify(this.inbox)}`);
        found = this.inbox.splice(index, 1)[0];
      },
      { timeout: 3_000, interval: 20 },
    );
    return found as Msg;
  }

  closed(): Promise<number> {
    return this.closeCode;
  }
}

describe('Video chat (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let wsUrl: string;
  const sent: MailMessage[] = [];
  const users: Record<string, { id: string; auth: { Authorization: string } }> = {};
  const tabs: Tab[] = [];

  beforeAll(async () => {
    // Notifications on, with keys made for this run.
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${port}/v1/videochat/ws`;
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const jwt = app.get(JwtService);
    for (const [key, role] of [
      ['admin', Role.ADMIN],
      ['ana', Role.CLIENT],
      ['ben', Role.CLIENT],
      ['cai', Role.CLIENT],
      ['dan', Role.CLIENT],
    ] as const) {
      const email = `e2e-videochat-${key}-${tag}@codeqlick.test`;
      const user = await prisma.user.create({
        data: { email, name: key, role, passwordHash: 'x' },
      });
      const token = await jwt.signAsync({ sub: user.id, email, name: key, role });
      users[key] = { id: user.id, auth: { Authorization: `Bearer ${token}` } };
    }
  });

  afterAll(async () => {
    for (const tab of tabs) tab.socket.terminate();
    if (prisma) {
      const ids = Object.values(users).map((user) => user.id);
      await prisma.activityLog.deleteMany({ where: { targetId: { in: ids } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const onboard = (key: string) =>
    request(server())
      .put('/v1/videochat/me')
      .set(users[key]!.auth)
      .send({ birthDate: '1995-05-20', acceptTerms: true, termsVersion: VIDEOCHAT_TERMS_VERSION })
      .expect(200);
  const connect = async (key: string): Promise<Tab> => {
    const { body } = await request(server())
      .post('/v1/videochat/ticket')
      .set(users[key]!.auth)
      .expect(200);
    const tab = await Tab.open(wsUrl);
    tabs.push(tab);
    tab.send({ type: 'auth', ticket: body.ticket as string });
    await tab.next('ready');
    return tab;
  };

  it('asks for 18+ and the rules before giving a ticket', async () => {
    await request(server()).get('/v1/videochat/me').expect(401);
    const { body } = await request(server())
      .get('/v1/videochat/me')
      .set(users.ana!.auth)
      .expect(200);
    expect(body).toMatchObject({ onboarded: false, suspended: false });
    await request(server()).post('/v1/videochat/ticket').set(users.ana!.auth).expect(409);

    const under18 = new Date();
    under18.setUTCFullYear(under18.getUTCFullYear() - 17);
    await request(server())
      .put('/v1/videochat/me')
      .set(users.ana!.auth)
      .send({
        birthDate: under18.toISOString().slice(0, 10),
        acceptTerms: true,
        termsVersion: VIDEOCHAT_TERMS_VERSION,
      })
      .expect(403);
    await request(server())
      .put('/v1/videochat/me')
      .set(users.ana!.auth)
      .send({ birthDate: '1995-05-20', acceptTerms: false, termsVersion: VIDEOCHAT_TERMS_VERSION })
      .expect(400);

    for (const key of ['ana', 'ben', 'cai', 'dan']) {
      const { body: status } = await onboard(key);
      expect(status).toMatchObject({ onboarded: true });
    }
  });

  it('saves the public profile and filters, and shows how many people are online', async () => {
    const profile = {
      nickname: 'Ana',
      gender: 'WOMAN',
      seeking: [],
      country: 'ES',
      language: 'es',
      sameCountryOnly: false,
      sameLanguageOnly: false,
    };
    await request(server())
      .put('/v1/videochat/profile')
      .set(users.admin!.auth)
      .send(profile)
      .expect(409);
    await request(server())
      .put('/v1/videochat/profile')
      .set(users.ana!.auth)
      .send({ ...profile, country: 'Spain' })
      .expect(400);
    await request(server())
      .put('/v1/videochat/profile')
      .set(users.ana!.auth)
      .send(profile)
      .expect(200, profile);
    const { body } = await request(server())
      .get('/v1/videochat/me')
      .set(users.ana!.auth)
      .expect(200);
    expect(body.profile).toEqual(profile);

    const { body: online } = await request(server()).get('/v1/videochat/online').expect(200);
    expect(online).toEqual({ online: expect.any(Number) });
  });

  it('refuses sockets from other origins, and bad or reused tickets', async () => {
    await expect(Tab.open(wsUrl, 'https://evil.example')).rejects.toThrow('HTTP 403');

    const { body } = await request(server())
      .post('/v1/videochat/ticket')
      .set(users.ana!.auth)
      .expect(200);
    const first = await Tab.open(wsUrl);
    tabs.push(first);
    first.send({ type: 'auth', ticket: body.ticket as string });
    await first.next('ready');
    first.socket.close();

    const reused = await Tab.open(wsUrl);
    tabs.push(reused);
    reused.send({ type: 'auth', ticket: body.ticket as string });
    expect(await reused.next('error')).toEqual({ type: 'error', code: 'invalid-ticket' });
    expect(await reused.closed()).toBe(4401);

    const unauthenticated = await Tab.open(wsUrl);
    tabs.push(unauthenticated);
    unauthenticated.send({ type: 'join' });
    expect(await unauthenticated.next('error')).toEqual({
      type: 'error',
      code: 'not-authenticated',
    });
    unauthenticated.send({ type: 'nonsense' });
    expect(await unauthenticated.next('error')).toEqual({ type: 'error', code: 'bad-message' });
    unauthenticated.socket.close();
  });

  it('pairs two people, relays the call and the chat, and handles next', async () => {
    const ana = await connect('ana');
    const ben = await connect('ben');

    ana.send({ type: 'join' });
    await ana.next('waiting');
    ben.send({ type: 'join' });
    // Each side sees the other's public profile, never the account name.
    expect(await ben.next('matched')).toEqual({
      type: 'matched',
      initiator: true,
      partner: { nickname: 'Ana', gender: 'WOMAN', country: 'ES', language: 'es' },
    });
    expect(await ana.next('matched')).toEqual({
      type: 'matched',
      initiator: false,
      partner: { nickname: null, gender: null, country: null, language: null },
    });

    const offer = { sdp: { type: 'offer', sdp: 'v=0 fake offer' } };
    ben.send({ type: 'signal', data: offer });
    expect(await ana.next('signal')).toEqual({ type: 'signal', data: offer });
    const candidate = {
      candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0' },
    };
    ana.send({ type: 'signal', data: candidate });
    expect(await ben.next('signal')).toEqual({ type: 'signal', data: candidate });

    ana.send({ type: 'chat', text: '  Hola!  ' });
    expect(await ben.next('chat')).toEqual({ type: 'chat', text: 'Hola!' });
    ana.send({ type: 'chat', text: 'x'.repeat(501) });
    expect(await ana.next('error')).toEqual({ type: 'error', code: 'bad-message' });

    // Next: ben leaves the call and waits (ana was his last partner, so not her again yet).
    ben.send({ type: 'next' });
    await ana.next('partner-left');
    await ben.next('waiting');
    ana.send({ type: 'join' });
    // She is told someone else waits but can't be paired with her now.
    expect(await ana.next('waiting')).toEqual({ type: 'waiting', others: 1 });

    // A third person gets one of them.
    const cai = await connect('cai');
    cai.send({ type: 'join' });
    await cai.next('matched');
    ben.send({ type: 'leave' });
    ana.send({ type: 'leave' });
    cai.send({ type: 'leave' });
    ana.socket.close();
    ben.socket.close();
    cai.socket.close();
  });

  it('report blocks the pair, stores the chat, and three reports suspend the account', async () => {
    const danTab = await connect('dan');
    const reporters = ['ana', 'ben', 'cai'];
    for (const [index, key] of reporters.entries()) {
      const reporter = await connect(key);
      danTab.send({ type: 'join' });
      await danTab.next('waiting');
      reporter.send({ type: 'join' });
      await reporter.next('matched');
      await danTab.next('matched');
      danTab.send({ type: 'chat', text: 'something rude' });
      await reporter.next('chat');
      reporter.send({ type: 'report', reason: 'HARASSMENT', details: 'Insults' });
      await reporter.next('reported');
      // The third report suspends dan: told, and disconnected.
      const last = index === reporters.length - 1;
      await danTab.next(last ? 'suspended' : 'partner-left');
      reporter.socket.close();
    }
    expect(await danTab.closed()).toBe(4403);

    const blocks = await prisma.videochatBlock.count({ where: { blockedId: users.dan!.id } });
    expect(blocks).toBe(3);
    await request(server()).post('/v1/videochat/ticket').set(users.dan!.auth).expect(403);

    // The team sees the reports with the chat, and can lift the suspension.
    await request(server()).get('/v1/admin/videochat/reports').set(users.ana!.auth).expect(403);
    const { body: reports } = await request(server())
      .get('/v1/admin/videochat/reports')
      .set(users.admin!.auth)
      .expect(200);
    const mine = (reports as Array<{ reported: { id: string }; transcript: unknown[] }>).filter(
      (report) => report.reported.id === users.dan!.id,
    );
    expect(mine).toHaveLength(3);
    expect(mine[0]).toMatchObject({
      reason: 'HARASSMENT',
      details: 'Insults',
      transcript: [{ from: 'reported', text: 'something rude' }],
      reported: { recentReports: 3 },
    });
    expect(mine[0]?.reported).toHaveProperty('suspendedAt');

    const { body: suspensions } = await request(server())
      .get('/v1/admin/videochat/suspensions')
      .set(users.admin!.auth)
      .expect(200);
    expect(suspensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user: expect.objectContaining({ id: users.dan!.id }) }),
      ]),
    );
    await request(server())
      .delete(`/v1/admin/videochat/suspensions/${users.dan!.id}`)
      .set(users.admin!.auth)
      .expect(204);
    await request(server()).post('/v1/videochat/ticket').set(users.dan!.auth).expect(200);

    const reportId = (mine[0] as unknown as { id: string }).id;
    await request(server())
      .post(`/v1/admin/videochat/reports/${reportId}/dismiss`)
      .set(users.admin!.auth)
      .expect(204);
    const { body: dismissed } = await request(server())
      .get('/v1/admin/videochat/reports?status=DISMISSED')
      .set(users.admin!.auth)
      .expect(200);
    expect(dismissed).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: reportId, status: 'DISMISSED' })]),
    );
  });

  it('suspends at once and emails the team when someone reports a possible minor', async () => {
    const ana = await connect('ana');
    const cai = await connect('cai');
    // ana and cai haven't blocked each other.
    ana.send({ type: 'join' });
    await ana.next('waiting');
    cai.send({ type: 'join' });
    await cai.next('matched');
    const before = sent.length;
    cai.send({ type: 'report', reason: 'MINOR' });
    await cai.next('reported');
    await ana.next('suspended');
    expect(await ana.closed()).toBe(4403);
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)?.subject).toBe('Video chat: possible minor reported');
    const { body: status } = await request(server())
      .get('/v1/videochat/me')
      .set(users.ana!.auth)
      .expect(200);
    expect(status).toMatchObject({ suspended: true, allowed: false });
    cai.socket.close();
  });
  it('lets a suspended person appeal once, and the team answer it', async () => {
    // ana was suspended by the report above, until the team reviews it.
    const me = () => request(server()).get('/v1/videochat/me').set(users.ana!.auth).expect(200);
    expect((await me()).body.suspension).toEqual({
      reason: 'Automatic: reported as possibly under 18',
      until: null,
      appeal: null,
    });
    await request(server())
      .post('/v1/videochat/appeal')
      .set(users.ben!.auth)
      .send({ message: 'I did nothing wrong at all' })
      .expect(409);
    await request(server())
      .post('/v1/videochat/appeal')
      .set(users.ana!.auth)
      .send({ message: 'short' })
      .expect(400);
    await request(server())
      .post('/v1/videochat/appeal')
      .set(users.ana!.auth)
      .send({ message: 'I am 31, happy to show an ID.' })
      .expect(204);
    await request(server())
      .post('/v1/videochat/appeal')
      .set(users.ana!.auth)
      .send({ message: 'Please, again, I am an adult.' })
      .expect(409);

    const appeals = async () =>
      (
        await request(server())
          .get('/v1/admin/videochat/appeals')
          .set(users.admin!.auth)
          .expect(200)
      ).body as Array<{ id: string; user: { id: string } }>;
    const appeal = (await appeals()).find((a) => a.user.id === users.ana!.id);
    expect(appeal).toMatchObject({
      message: 'I am 31, happy to show an ID.',
      status: 'OPEN',
      sanction: { reason: 'Automatic: reported as possibly under 18', until: null },
    });
    const before = sent.length;
    await request(server())
      .post(`/v1/admin/videochat/appeals/${appeal!.id}/reject`)
      .set(users.admin!.auth)
      .send({ response: 'Send us the ID first.' })
      .expect(204);
    await request(server())
      .post(`/v1/admin/videochat/appeals/${appeal!.id}/accept`)
      .set(users.admin!.auth)
      .send({})
      .expect(409);
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)).toMatchObject({ to: expect.stringContaining('e2e-videochat-ana-') });
    expect(sent.at(-1)?.text).toContain('Send us the ID first.');
    expect((await me()).body).toMatchObject({
      suspended: true,
      suspension: { appeal: { status: 'REJECTED', response: 'Send us the ID first.' } },
    });

    // A new suspension (timed, from the team) can be appealed again; accepting lifts it.
    await request(server())
      .delete(`/v1/admin/videochat/suspensions/${users.ana!.id}`)
      .set(users.admin!.auth)
      .expect(204);
    await request(server())
      .post(`/v1/admin/videochat/users/${users.ana!.id}/suspend`)
      .set(users.admin!.auth)
      .send({ reason: 'Spam links', duration: '24h' })
      .expect(204);
    const { body: status } = await me();
    const until = new Date(status.suspension.until as string).getTime();
    expect(until - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(status.suspension).toMatchObject({ reason: 'Spam links', appeal: null });
    await request(server())
      .post('/v1/videochat/appeal')
      .set(users.ana!.auth)
      .send({ message: 'It was a mistake, sorry.' })
      .expect(204);
    const second = (await appeals()).find((a) => a.user.id === users.ana!.id);
    await request(server())
      .post(`/v1/admin/videochat/appeals/${second!.id}/accept`)
      .set(users.admin!.auth)
      .send({ response: 'Welcome back.' })
      .expect(204);
    expect((await me()).body).toMatchObject({ suspended: false, suspension: null, allowed: true });

    // The person's page keeps the whole history, and the log has every step.
    const { body: detail } = await request(server())
      .get(`/v1/admin/videochat/users/${users.ana!.id}`)
      .set(users.admin!.auth)
      .expect(200);
    expect(detail.sanctions.map((s: { kind: string }) => s.kind)).toEqual([
      'LIFTED',
      'SUSPENDED',
      'LIFTED',
      'SUSPENDED',
    ]);
    expect(detail.sanctions[3]).toMatchObject({ by: null });
    expect(detail.sanctions[2]).toMatchObject({ by: { id: users.admin!.id } });
    expect(detail.appeals.map((a: { status: string }) => a.status)).toEqual([
      'ACCEPTED',
      'REJECTED',
    ]);
    expect(detail.reportsReceived).toHaveLength(1);
    expect(detail.reportsMade).toHaveLength(1);
    expect(detail.profile).toMatchObject({ nickname: 'Ana' });
    const actions = await prisma.activityLog.findMany({
      where: { targetId: users.ana!.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual([
      'videochat.suspended',
      'videochat.appeal_rejected',
      'videochat.unsuspended',
      'videochat.suspended',
      'videochat.appeal_accepted',
    ]);
  });

  it('matches only people whose filters fit both ways', async () => {
    const settings = (gender: string | null, seeking: string[]) => ({
      nickname: null,
      gender,
      seeking,
      country: null,
      language: null,
      sameCountryOnly: false,
      sameLanguageOnly: false,
    });
    await request(server())
      .put('/v1/videochat/profile')
      .set(users.ben!.auth)
      .send(settings('MAN', ['WOMAN']))
      .expect(200);
    const ben = await connect('ben');
    ben.send({ type: 'join' });
    await ben.next('waiting');
    // cai has no gender: ben's filter leaves her out.
    let cai = await connect('cai');
    cai.send({ type: 'join' });
    await cai.next('waiting');
    cai.socket.close();
    await request(server())
      .put('/v1/videochat/profile')
      .set(users.cai!.auth)
      .send(settings('WOMAN', []))
      .expect(200);
    cai = await connect('cai');
    cai.send({ type: 'join' });
    expect(await cai.next('matched')).toMatchObject({ partner: { gender: 'MAN' } });
    ben.socket.close();
    cai.socket.close();
  });

  it("stores and removes a browser's push subscription", async () => {
    const subscription = {
      endpoint: `https://push.example.test/${tag}`,
      keys: { p256dh: 'BPublicKeyOfTheBrowser', auth: 'secretAuth' },
      locale: 'es',
    };
    // Before accepting the rules: no.
    await request(server())
      .put('/v1/videochat/push')
      .set(users.admin!.auth)
      .send(subscription)
      .expect(409);
    await onboard('dan');
    await request(server())
      .put('/v1/videochat/push')
      .set(users.dan!.auth)
      .send({ ...subscription, endpoint: 'http://push.example.test/insecure' })
      .expect(400);
    await request(server())
      .put('/v1/videochat/push')
      .set(users.dan!.auth)
      .send(subscription)
      .expect(204);
    const { body } = await request(server())
      .get('/v1/videochat/me')
      .set(users.dan!.auth)
      .expect(200);
    expect(body.pushPublicKey).toBe(process.env.VAPID_PUBLIC_KEY);
    expect(
      await prisma.videochatPushSubscription.count({
        where: { userId: users.dan!.id, endpoint: subscription.endpoint, locale: 'es' },
      }),
    ).toBe(1);

    await request(server())
      .delete('/v1/videochat/push')
      .set(users.dan!.auth)
      .send({ endpoint: subscription.endpoint })
      .expect(204);
    expect(await prisma.videochatPushSubscription.count({ where: { userId: users.dan!.id } })).toBe(
      0,
    );
  });
});
