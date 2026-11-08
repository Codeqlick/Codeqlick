import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Subscription } from 'rxjs';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { AppConfigService } from '../../config/app-config.service.js';
import { clientIp, ownUpgrade, rejectUpgrade, WS_PATHS } from '../../common/websocket/websocket.js';
import { WindowLimiter } from '../videochat/matchmaker.js';
import {
  clientMessageSchema,
  MEETING_MAX_PEOPLE,
  MEETING_MAX_WAITING,
  type ClientMessage,
  type MediaState,
  type MeetingErrorCode,
  type PeerInfo,
  type ServerMessage,
} from './meetings.schemas.js';
import { MeetingsService, type RoomEvent } from './meetings.service.js';

/** Where browsers open the meetings' socket (Nginx maps wss://meetings.codeqlick.com/ws here). */
export const MEETINGS_WS_PATH = WS_PATHS.meetings;
/** Largest message accepted (an SDP offer is a few KB). */
const MAX_MESSAGE_BYTES = 64 * 1024;
/** A socket must authenticate within this time. */
const AUTH_TIMEOUT_MS = 5_000;
/** Open sockets per IP (an office or a family behind one router, but not a flood). */
const MAX_SOCKETS_PER_IP = 10;
/** Sent every 30 s; a socket that didn't answer the previous one is dropped. */
const HEARTBEAT_MS = 30_000;

/** Close codes the page understands. */
export const CLOSE = {
  unauthenticated: 4401,
  refused: 4403,
  notFound: 4404,
  full: 4409,
  ended: 4410,
  tooMany: 4429,
} as const;

interface LiveRoom {
  id: string;
  code: string;
  title: string;
  ownerId: string;
  lobby: boolean;
  inside: Map<string, Member>;
  waiting: Map<string, Member>;
}

interface Member {
  id: string;
  socket: WebSocket;
  ip: string;
  alive: boolean;
  authTimer?: NodeJS.Timeout;
  /** Set once the ticket is redeemed. */
  room?: LiveRoom;
  state?: 'waiting' | 'inside';
  userId: string | null;
  name: string;
  owner: boolean;
  media: MediaState;
  limits: { all: WindowLimiter; chat: WindowLimiter; signal: WindowLimiter };
}

/**
 * The meetings' signaling server: a WebSocket on the API's HTTP server. Each socket redeems a
 * single-use ticket for a room, waits in the room's waiting room or goes in, and relays WebRTC
 * negotiation between the people inside (a mesh: everyone connects to everyone). Media never
 * passes through it (architecture 4.8).
 */
@Injectable()
export class MeetingsGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MeetingsGateway.name);
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  private readonly members = new Map<string, Member>();
  private readonly rooms = new Map<string, LiveRoom>();
  private readonly socketsPerIp = new Map<string, number>();
  private server?: Server;
  private heartbeat?: NodeJS.Timeout;
  private events?: Subscription;
  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) =>
    this.upgrade(request, socket, head);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly meetings: MeetingsService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    this.server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.server.on('upgrade', this.onUpgrade);
    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) =>
      this.connected(socket, request),
    );
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
    this.heartbeat.unref();
    this.events = this.meetings.events.subscribe((event) => this.roomChanged(event));
  }

  onModuleDestroy(): void {
    this.server?.off('upgrade', this.onUpgrade);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.events?.unsubscribe();
    for (const member of this.members.values()) member.socket.terminate();
    this.wss.close();
  }

  /** People in a room's meeting right now. */
  live(roomId: string): number {
    return this.rooms.get(roomId)?.inside.size ?? 0;
  }

  /** Meetings going on and people in them, for monitoring. */
  get stats(): { meetings: number; people: number } {
    let people = 0;
    for (const room of this.rooms.values()) people += room.inside.size;
    return { meetings: this.rooms.size, people };
  }

  // --- Connection lifecycle ------------------------------------------------------------------

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!ownUpgrade(request, socket, MEETINGS_WS_PATH)) return;
    const origin = request.headers.origin?.replace(/\/+$/, '');
    const originAllowed = origin
      ? this.config.meetingsOrigins.includes(origin)
      : !this.config.isProduction;
    if (!originAllowed) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    const ip = clientIp(request);
    if ((this.socketsPerIp.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) {
      rejectUpgrade(socket, 429, 'Too Many Requests');
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  private connected(socket: WebSocket, request: IncomingMessage): void {
    const ip = clientIp(request);
    this.socketsPerIp.set(ip, (this.socketsPerIp.get(ip) ?? 0) + 1);
    const member: Member = {
      id: randomUUID(),
      socket,
      ip,
      alive: true,
      userId: null,
      name: '',
      owner: false,
      media: { audio: false, video: false, screen: false },
      limits: {
        all: new WindowLimiter(400, 60_000),
        chat: new WindowLimiter(20, 10_000),
        signal: new WindowLimiter(300, 60_000),
      },
    };
    this.members.set(member.id, member);
    member.authTimer = setTimeout(() => {
      if (!member.room) this.close(member, CLOSE.unauthenticated, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('pong', () => {
      member.alive = true;
    });
    socket.on('message', (raw: RawData, isBinary: boolean) => {
      void this.received(member, raw, isBinary).catch((error: unknown) => {
        this.logger.error(`Meetings message failed: ${String(error)}`);
      });
    });
    socket.on('close', () => this.disconnected(member));
    socket.on('error', () => socket.terminate());
  }

  private disconnected(member: Member): void {
    if (!this.members.delete(member.id)) return;
    if (member.authTimer) clearTimeout(member.authTimer);
    const room = member.room;
    if (room) {
      if (room.inside.delete(member.id)) {
        this.broadcast(room, { type: 'left', id: member.id });
      }
      if (room.waiting.delete(member.id)) {
        this.toOwners(room, { type: 'knock-gone', id: member.id });
      }
      if (room.inside.size === 0 && room.waiting.size === 0) this.rooms.delete(room.id);
    }
    const count = (this.socketsPerIp.get(member.ip) ?? 1) - 1;
    if (count <= 0) this.socketsPerIp.delete(member.ip);
    else this.socketsPerIp.set(member.ip, count);
  }

  private ping(): void {
    for (const member of this.members.values()) {
      if (!member.alive) {
        member.socket.terminate();
        continue;
      }
      member.alive = false;
      member.socket.ping();
    }
  }

  // --- Messages ------------------------------------------------------------------------------

  private async received(member: Member, raw: RawData, isBinary: boolean): Promise<void> {
    if (!member.limits.all.take()) {
      this.close(member, CLOSE.tooMany, 'Too many messages');
      return;
    }
    let message: ClientMessage;
    try {
      if (isBinary) throw new Error('binary');
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString() : raw.toString();
      const parsed = clientMessageSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error('invalid');
      message = parsed.data;
    } catch {
      this.error(member, 'bad-message');
      return;
    }

    if (message.type === 'auth') {
      if (!member.room) await this.authenticate(member, message);
      return;
    }
    const room = member.room;
    if (!room) {
      this.error(member, 'not-authenticated');
      return;
    }

    switch (message.type) {
      case 'media': {
        member.media = { audio: message.audio, video: message.video, screen: message.screen };
        if (member.state === 'inside') {
          this.broadcast(room, { type: 'media', id: member.id, ...member.media }, member);
        }
        return;
      }
      case 'signal': {
        if (member.state !== 'inside') return;
        if (!member.limits.signal.take()) return this.error(member, 'rate-limited');
        const target = room.inside.get(message.to);
        if (target) this.send(target, { type: 'signal', from: member.id, data: message.data });
        return;
      }
      case 'chat': {
        if (member.state !== 'inside') return;
        if (!member.limits.chat.take()) return this.error(member, 'rate-limited');
        this.broadcast(room, {
          type: 'chat',
          from: member.id,
          name: member.name,
          text: message.text,
          at: new Date().toISOString(),
        });
        return;
      }
      default:
        break;
    }

    // The rest is the owner's, from inside the meeting.
    if (!member.owner || member.state !== 'inside') {
      this.error(member, 'not-owner');
      return;
    }
    switch (message.type) {
      case 'admit': {
        const knocking = room.waiting.get(message.id);
        if (!knocking) return this.error(member, 'not-found');
        room.waiting.delete(knocking.id);
        this.toOwners(room, { type: 'knock-gone', id: knocking.id });
        if (message.accept) {
          this.enter(knocking, room);
        } else {
          this.send(knocking, { type: 'declined' });
          this.close(knocking, CLOSE.refused, 'Declined');
        }
        return;
      }
      case 'remove': {
        const target = room.inside.get(message.id);
        if (!target || target.owner) return this.error(member, 'not-found');
        this.send(target, { type: 'removed' });
        this.close(target, CLOSE.refused, 'Removed');
        return;
      }
      case 'lobby':
        await this.meetings.setLobby(room.id, message.on);
        this.setLobby(room, message.on);
        return;
      case 'end':
        this.endRoom(room);
        return;
      default:
        return;
    }
  }

  private async authenticate(
    member: Member,
    message: Extract<ClientMessage, { type: 'auth' }>,
  ): Promise<void> {
    const holder = this.meetings.redeemTicket(message.ticket);
    if (!holder) {
      this.error(member, 'invalid-ticket');
      this.close(member, CLOSE.unauthenticated, 'Invalid ticket');
      return;
    }
    if (member.authTimer) clearTimeout(member.authTimer);
    let room = this.rooms.get(holder.roomId);
    if (!room) {
      const stored = await this.meetings.findRoom(holder.roomId);
      if (!this.members.has(member.id)) return;
      if (!stored) {
        this.error(member, 'not-found');
        this.close(member, CLOSE.notFound, 'Room not found');
        return;
      }
      // Another socket may have opened it meanwhile.
      room = this.rooms.get(holder.roomId) ?? {
        id: stored.id,
        code: stored.code,
        title: stored.title,
        ownerId: stored.ownerId,
        lobby: stored.lobby,
        inside: new Map(),
        waiting: new Map(),
      };
      this.rooms.set(room.id, room);
    }
    if (!this.members.has(member.id)) return;

    member.room = room;
    member.userId = holder.userId;
    member.name = holder.name;
    member.owner = holder.userId !== null && holder.userId === room.ownerId;
    member.media = {
      audio: message.audio ?? false,
      video: message.video ?? false,
      screen: false,
    };
    if (member.owner || !room.lobby) this.enter(member, room);
    else this.knock(member, room);
  }

  private enter(member: Member, room: LiveRoom): void {
    if (room.inside.size >= MEETING_MAX_PEOPLE) {
      this.send(member, { type: 'full' });
      this.close(member, CLOSE.full, 'Full');
      return;
    }
    const peers = [...room.inside.values()].map((peer) => this.info(peer));
    room.inside.set(member.id, member);
    member.state = 'inside';
    if (room.inside.size === 1) {
      void this.meetings.touch(room.id).catch((error: unknown) => {
        this.logger.warn(`Meeting room not touched: ${String(error)}`);
      });
    }
    this.send(member, {
      type: 'ready',
      self: this.info(member),
      room: { code: room.code, title: room.title, lobby: room.lobby },
      peers,
      knocks: member.owner
        ? [...room.waiting.values()].map((knocking) => ({ id: knocking.id, name: knocking.name }))
        : [],
    });
    this.broadcast(room, { type: 'joined', peer: this.info(member) }, member);
  }

  private knock(member: Member, room: LiveRoom): void {
    if (room.waiting.size >= MEETING_MAX_WAITING) {
      this.send(member, { type: 'full' });
      this.close(member, CLOSE.full, 'Full');
      return;
    }
    room.waiting.set(member.id, member);
    member.state = 'waiting';
    this.send(member, { type: 'waiting', title: room.title });
    this.toOwners(room, { type: 'knock', id: member.id, name: member.name });
  }

  private setLobby(room: LiveRoom, on: boolean): void {
    if (room.lobby === on) return;
    room.lobby = on;
    this.broadcast(room, { type: 'lobby', on });
    if (!on) {
      // Everyone knocking goes in (deleting while iterating a Map is safe).
      for (const knocking of room.waiting.values()) {
        room.waiting.delete(knocking.id);
        this.toOwners(room, { type: 'knock-gone', id: knocking.id });
        this.enter(knocking, room);
      }
    }
  }

  private endRoom(room: LiveRoom): void {
    this.rooms.delete(room.id);
    for (const member of [...room.inside.values(), ...room.waiting.values()]) {
      this.send(member, { type: 'ended' });
      this.close(member, CLOSE.ended, 'Ended');
    }
  }

  private roomChanged(event: RoomEvent): void {
    const room = this.rooms.get(event.roomId);
    if (!room) return;
    if (event.kind === 'deleted') {
      this.endRoom(room);
      return;
    }
    room.title = event.title;
    this.setLobby(room, event.lobby);
  }

  // --- Helpers -------------------------------------------------------------------------------

  private info(member: Member): PeerInfo {
    return {
      id: member.id,
      name: member.name,
      owner: member.owner,
      guest: member.userId === null,
      ...member.media,
    };
  }

  /** To everyone inside, but `except`. */
  private broadcast(room: LiveRoom, message: ServerMessage, except?: Member): void {
    for (const member of room.inside.values()) {
      if (member !== except) this.send(member, message);
    }
  }

  private toOwners(room: LiveRoom, message: ServerMessage): void {
    for (const member of room.inside.values()) {
      if (member.owner) this.send(member, message);
    }
  }

  private send(member: Member, message: ServerMessage): void {
    if (member.socket.readyState === WebSocket.OPEN) member.socket.send(JSON.stringify(message));
  }

  private error(member: Member, code: MeetingErrorCode): void {
    this.send(member, { type: 'error', code });
  }

  private close(member: Member, code: number, reason: string): void {
    member.socket.close(code, reason);
    // The others hear at once, not when the close handshake ends.
    this.disconnected(member);
  }
}
