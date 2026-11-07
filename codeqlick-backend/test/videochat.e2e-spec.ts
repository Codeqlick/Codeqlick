import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
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
    expect(await ben.next('matched')).toEqual({ type: 'matched', initiator: true });
    expect(await ana.next('matched')).toEqual({ type: 'matched', initiator: false });

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
    await ana.next('waiting');

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
});
