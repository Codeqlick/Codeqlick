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
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const ORIGIN = 'http://meetings.localhost:3000';
type Msg = { type: string; [key: string]: unknown };

/** A browser tab in a meeting: a socket plus the messages it received. */
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

describe('Meetings (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let wsUrl: string;
  const users: Record<string, { id: string; auth: { Authorization: string } }> = {};
  const tabs: Tab[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${port}/v1/meetings/ws`;
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    for (const key of ['owner', 'other'] as const) {
      const email = `e2e-meetings-${key}-${tag}@codeqlick.test`;
      const user = await prisma.user.create({
        data: {
          email,
          name: key === 'owner' ? 'Olga Owner' : 'Otto',
          role: Role.CLIENT,
          passwordHash: 'x',
        },
      });
      const token = await jwt.signAsync({
        sub: user.id,
        email,
        name: user.name,
        role: Role.CLIENT,
      });
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
  const open = async () => {
    const tab = await Tab.open(wsUrl);
    tabs.push(tab);
    return tab;
  };
  const createRoom = async (title: string) => {
    const response = await request(server())
      .post('/v1/meetings/rooms')
      .set(users.owner!.auth)
      .send({ title })
      .expect(201);
    return response.body as { id: string; code: string; lobby: boolean; live: number };
  };
  const userTicket = async (code: string, key: 'owner' | 'other') =>
    (
      await request(server())
        .post(`/v1/meetings/rooms/${code}/ticket`)
        .set(users[key]!.auth)
        .expect(200)
    ).body as { ticket: string };
  // Guests' tickets are limited per IP: each one comes from its own (the API trusts one proxy hop).
  let guests = 0;
  const guestTicket = async (code: string, name: string) =>
    (
      await request(server())
        .post(`/v1/meetings/rooms/${code}/guest-ticket`)
        .set('X-Forwarded-For', `10.9.0.${(guests += 1)}`)
        .send({ name })
        .expect(200)
    ).body as { ticket: string };

  it('creates, lists, shows publicly, renames and deletes rooms', async () => {
    const room = await createRoom('Weekly call');
    expect(room.code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(room.lobby).toBe(true);

    const list = await request(server())
      .get('/v1/meetings/rooms')
      .set(users.owner!.auth)
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(room.id);

    // Public, and the code is forgiving (case, missing dashes).
    const pub = await request(server())
      .get(`/v1/meetings/rooms/by-code/${room.code.replaceAll('-', '').toUpperCase()}`)
      .expect(200);
    expect(pub.body).toEqual({
      code: room.code,
      title: 'Weekly call',
      ownerName: 'Olga Owner',
      live: 0,
    });
    await request(server()).get('/v1/meetings/rooms/by-code/abc-defg-hjk').expect(404);
    await request(server()).get('/v1/meetings/rooms/by-code/nope').expect(400);

    // Only the owner may change it.
    await request(server())
      .patch(`/v1/meetings/rooms/${room.id}`)
      .set(users.other!.auth)
      .send({ title: 'Mine' })
      .expect(404);
    const renamed = await request(server())
      .patch(`/v1/meetings/rooms/${room.id}`)
      .set(users.owner!.auth)
      .send({ title: 'Team call' })
      .expect(200);
    expect(renamed.body.title).toBe('Team call');

    await request(server()).get('/v1/meetings/rooms').expect(401);
    await request(server())
      .delete(`/v1/meetings/rooms/${room.id}`)
      .set(users.owner!.auth)
      .expect(204);
    await request(server()).get(`/v1/meetings/rooms/by-code/${room.code}`).expect(404);
  });

  it('lets the owner in, makes others knock, relays signals and chat, and ends', async () => {
    const room = await createRoom('Demo');
    await request(server())
      .post(`/v1/meetings/rooms/${room.code}/guest-ticket`)
      .send({ name: 'x' })
      .expect(400);

    const owner = await open();
    owner.send({
      type: 'auth',
      ticket: (await userTicket(room.code, 'owner')).ticket,
      audio: true,
      video: true,
    });
    const ready = await owner.next('ready');
    expect(ready.self).toMatchObject({
      name: 'Olga Owner',
      owner: true,
      guest: false,
      audio: true,
    });
    expect(ready.peers).toEqual([]);
    expect(ready.room).toEqual({ code: room.code, title: 'Demo', lobby: true });

    // A guest knocks; the owner lets them in.
    const guest = await open();
    guest.send({ type: 'auth', ticket: (await guestTicket(room.code, 'Gina')).ticket });
    await guest.next('waiting');
    const knock = await owner.next('knock');
    expect(knock.name).toBe('Gina');

    // Only the owner may admit.
    const other = await open();
    other.send({ type: 'auth', ticket: (await userTicket(room.code, 'other')).ticket });
    await other.next('waiting');
    await owner.next('knock');

    owner.send({ type: 'admit', id: knock.id, accept: true });
    const guestReady = await guest.next('ready');
    expect(guestReady.peers).toEqual([
      expect.objectContaining({ name: 'Olga Owner', owner: true }),
    ]);
    expect((await owner.next('joined')).peer).toMatchObject({ id: knock.id, guest: true });
    await owner.next('knock-gone');

    guest.send({ type: 'admit', id: knock.id, accept: true });
    expect((await guest.next('error')).code).toBe('not-owner');

    // The newcomer offers; the signal reaches only its target.
    const ownerId = (ready.self as { id: string }).id;
    guest.send({ type: 'signal', to: ownerId, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
    const signal = await owner.next('signal');
    expect(signal).toMatchObject({ from: knock.id, data: { sdp: { type: 'offer' } } });

    guest.send({ type: 'chat', text: 'hola' });
    expect(await owner.next('chat')).toMatchObject({ name: 'Gina', text: 'hola' });
    await guest.next('chat');

    guest.send({ type: 'media', audio: false, video: true, screen: true });
    expect(await owner.next('media')).toMatchObject({ id: knock.id, audio: false, screen: true });

    const live = await request(server()).get(`/v1/meetings/rooms/by-code/${room.code}`).expect(200);
    expect(live.body.live).toBe(2);

    // Turning the waiting room off lets Otto in.
    owner.send({ type: 'lobby', on: false });
    await other.next('ready');
    expect((await guest.next('lobby')).on).toBe(false);
    const stored = await prisma.meetingRoom.findUnique({ where: { id: room.id } });
    expect(stored?.lobby).toBe(false);
    expect(stored?.lastUsedAt).not.toBeNull();

    // Removing someone; the others hear they left.
    const otherId = ((await guest.next('joined')).peer as { id: string }).id;
    owner.send({ type: 'remove', id: otherId });
    await other.next('removed');
    expect(await other.closed()).toBe(4403);
    expect((await guest.next('left')).id).toBe(otherId);

    owner.send({ type: 'end' });
    await guest.next('ended');
    expect(await guest.closed()).toBe(4410);
    expect(await owner.closed()).toBe(4410);
  });

  it('declines, refuses bad tickets and other origins, and ends a deleted room', async () => {
    const room = await createRoom('Private');
    const owner = await open();
    owner.send({ type: 'auth', ticket: (await userTicket(room.code, 'owner')).ticket });
    await owner.next('ready');

    const guest = await open();
    guest.send({ type: 'auth', ticket: (await guestTicket(room.code, 'Gus')).ticket });
    const knock = await owner.next('knock');
    owner.send({ type: 'admit', id: knock.id, accept: false });
    await guest.next('declined');
    expect(await guest.closed()).toBe(4403);

    // A ticket works once.
    const { ticket } = await guestTicket(room.code, 'Twice');
    const first = await open();
    first.send({ type: 'auth', ticket });
    await first.next('waiting');
    const second = await open();
    second.send({ type: 'auth', ticket });
    await second.next('error');
    expect(await second.closed()).toBe(4401);

    await expect(Tab.open(wsUrl, 'https://evil.example')).rejects.toThrow('HTTP 403');

    // Deleting the room ends the meeting.
    await request(server())
      .delete(`/v1/meetings/rooms/${room.id}`)
      .set(users.owner!.auth)
      .expect(204);
    await owner.next('ended');
    await first.next('ended');
  });

  it('keeps meetings to six people', async () => {
    const room = await createRoom('Big');
    await request(server())
      .patch(`/v1/meetings/rooms/${room.id}`)
      .set(users.owner!.auth)
      .send({ lobby: false })
      .expect(200);
    for (let index = 0; index < 6; index += 1) {
      const tab = await open();
      tab.send({ type: 'auth', ticket: (await guestTicket(room.code, `Guest ${index}`)).ticket });
      await tab.next('ready');
    }
    const seventh = await open();
    seventh.send({ type: 'auth', ticket: (await guestTicket(room.code, 'Late')).ticket });
    await seventh.next('full');
    expect(await seventh.closed()).toBe(4409);
  });

  it('leaves the video chat socket working beside it', async () => {
    const tab = await Tab.open(wsUrl.replace('/meetings/', '/videochat/'), 'http://localhost:3000');
    tabs.push(tab);
    tab.send({ type: 'auth', ticket: 'x'.repeat(20) });
    expect((await tab.next('error')).code).toBe('invalid-ticket');
  });
});
