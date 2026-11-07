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
import { Matchmaker, WindowLimiter, type Participant } from './matchmaker.js';
import {
  clientMessageSchema,
  type ClientMessage,
  type ReportReason,
  type ServerMessage,
  type VideochatErrorCode,
} from './videochat.schemas.js';
import { VideochatService, type TranscriptLine } from './videochat.service.js';

/** Where browsers open the signaling socket (Nginx maps wss://videochat.codeqlick.com/ws here). */
export const VIDEOCHAT_WS_PATH = '/v1/videochat/ws';
/** Largest message accepted (an SDP offer is a few KB). */
const MAX_MESSAGE_BYTES = 64 * 1024;
/** A socket must authenticate within this time. */
const AUTH_TIMEOUT_MS = 5_000;
/** Open sockets per IP (several tabs or people behind one router, but not a flood). */
const MAX_SOCKETS_PER_IP = 5;
/** After a call, the same two people aren't paired again for this long. */
const REMATCH_COOLDOWN_MS = 60_000;
/** A call that just ended can still be reported or blocked for this long. */
const REPORT_WINDOW_MS = 5 * 60_000;
/** Text messages of a call kept for a report. */
const TRANSCRIPT_LINES = 30;
/** Sent every 30 s; a socket that didn't answer the previous one is dropped. */
const HEARTBEAT_MS = 30_000;

interface CallLog {
  lines: Array<{ userId: string; text: string; at: string }>;
}

interface Connection {
  id: string;
  socket: WebSocket;
  ip: string;
  alive: boolean;
  authTimer?: NodeJS.Timeout;
  participant?: Participant;
  call?: CallLog;
  /** The call that ended last, for a report or block right after it. */
  last?: { userId: string; call: CallLog; endedAt: number };
  limits: {
    all: WindowLimiter;
    next: WindowLimiter;
    chat: WindowLimiter;
    signal: WindowLimiter;
    reports: WindowLimiter;
  };
}

/**
 * The video chat's signaling server: a WebSocket on the API's HTTP server. It authenticates each
 * socket with a single-use ticket, pairs people at random and relays WebRTC negotiation and text
 * messages between the two of a call. Media never passes through it (architecture 4.7).
 */
@Injectable()
export class VideochatGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VideochatGateway.name);
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  private readonly matchmaker = new Matchmaker();
  private readonly connections = new Map<string, Connection>();
  private readonly byUser = new Map<string, Connection>();
  private readonly socketsPerIp = new Map<string, number>();
  private server?: Server;
  private heartbeat?: NodeJS.Timeout;
  private suspensions?: Subscription;
  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) =>
    this.upgrade(request, socket, head);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly videochat: VideochatService,
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
    this.suspensions = this.videochat.suspensions.subscribe((userId) => this.suspended(userId));
  }

  onModuleDestroy(): void {
    this.server?.off('upgrade', this.onUpgrade);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.suspensions?.unsubscribe();
    for (const connection of this.connections.values()) connection.socket.terminate();
    this.wss.close();
  }

  /** People waiting and calls going on, for monitoring. */
  get stats(): { online: number; waiting: number; calls: number } {
    return {
      online: this.byUser.size,
      waiting: this.matchmaker.waitingCount,
      calls: this.matchmaker.callCount,
    };
  }

  // --- Connection lifecycle ------------------------------------------------------------------

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = (request.url ?? '').split('?')[0];
    if (path !== VIDEOCHAT_WS_PATH) {
      socket.destroy();
      return;
    }
    const origin = request.headers.origin?.replace(/\/+$/, '');
    const originAllowed = origin
      ? this.config.videochatOrigins.includes(origin)
      : !this.config.isProduction;
    if (!originAllowed) {
      reject(socket, 403, 'Forbidden');
      return;
    }
    const ip = clientIp(request);
    if ((this.socketsPerIp.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) {
      reject(socket, 429, 'Too Many Requests');
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  private connected(socket: WebSocket, request: IncomingMessage): void {
    const ip = clientIp(request);
    this.socketsPerIp.set(ip, (this.socketsPerIp.get(ip) ?? 0) + 1);
    const connection: Connection = {
      id: randomUUID(),
      socket,
      ip,
      alive: true,
      limits: {
        all: new WindowLimiter(400, 60_000),
        next: new WindowLimiter(20, 60_000),
        chat: new WindowLimiter(20, 10_000),
        signal: new WindowLimiter(200, 60_000),
        reports: new WindowLimiter(5, 60_000),
      },
    };
    this.connections.set(connection.id, connection);
    connection.authTimer = setTimeout(() => {
      if (!connection.participant) this.close(connection, 4401, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (raw: RawData, isBinary: boolean) => {
      void this.received(connection, raw, isBinary).catch((error: unknown) => {
        this.logger.error(`Videochat message failed: ${String(error)}`);
      });
    });
    socket.on('close', () => this.disconnected(connection));
    socket.on('error', () => socket.terminate());
  }

  private disconnected(connection: Connection): void {
    if (!this.connections.delete(connection.id)) return;
    if (connection.authTimer) clearTimeout(connection.authTimer);
    this.endCall(connection);
    if (connection.participant && this.byUser.get(connection.participant.userId) === connection) {
      this.byUser.delete(connection.participant.userId);
    }
    const count = (this.socketsPerIp.get(connection.ip) ?? 1) - 1;
    if (count <= 0) this.socketsPerIp.delete(connection.ip);
    else this.socketsPerIp.set(connection.ip, count);
  }

  private ping(): void {
    for (const connection of this.connections.values()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }

  // --- Messages ------------------------------------------------------------------------------

  private async received(connection: Connection, raw: RawData, isBinary: boolean): Promise<void> {
    if (!connection.limits.all.take()) {
      this.close(connection, 4429, 'Too many messages');
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
      this.error(connection, 'bad-message');
      return;
    }

    if (message.type === 'auth') {
      await this.authenticate(connection, message.ticket);
      return;
    }
    const me = connection.participant;
    if (!me) {
      this.error(connection, 'not-authenticated');
      return;
    }
    switch (message.type) {
      case 'join':
        if (
          !this.matchmaker.partnerOf(connection.id) &&
          !this.matchmaker.isWaiting(connection.id)
        ) {
          this.join(connection);
        }
        return;
      case 'next':
        if (!connection.limits.next.take()) return this.error(connection, 'rate-limited');
        this.endCall(connection);
        this.join(connection);
        return;
      case 'leave':
        this.endCall(connection);
        this.matchmaker.remove(connection.id);
        return;
      case 'signal': {
        if (!connection.limits.signal.take()) return this.error(connection, 'rate-limited');
        const partner = this.partnerConnection(connection);
        if (!partner) return this.error(connection, 'no-partner');
        this.send(partner, { type: 'signal', data: message.data });
        return;
      }
      case 'chat': {
        if (!connection.limits.chat.take()) return this.error(connection, 'rate-limited');
        const partner = this.partnerConnection(connection);
        if (!partner || !connection.call) return this.error(connection, 'no-partner');
        connection.call.lines.push({
          userId: me.userId,
          text: message.text,
          at: new Date().toISOString(),
        });
        if (connection.call.lines.length > TRANSCRIPT_LINES) connection.call.lines.shift();
        this.send(partner, { type: 'chat', text: message.text });
        return;
      }
      case 'report':
        if (!connection.limits.reports.take()) return this.error(connection, 'rate-limited');
        await this.report(connection, message.reason, message.details);
        return;
      case 'block':
        if (!connection.limits.reports.take()) return this.error(connection, 'rate-limited');
        await this.block(connection);
        return;
    }
  }

  private async authenticate(connection: Connection, ticket: string): Promise<void> {
    if (connection.participant) return;
    const userId = this.videochat.redeemTicket(ticket);
    if (!userId || !(await this.videochat.canConnect(userId))) {
      this.error(connection, 'invalid-ticket');
      this.close(connection, 4401, 'Invalid ticket');
      return;
    }
    if (!this.connections.has(connection.id)) return;
    if (connection.authTimer) clearTimeout(connection.authTimer);
    // One live connection per account: a new tab takes over.
    const previous = this.byUser.get(userId);
    if (previous) {
      this.error(previous, 'replaced');
      this.close(previous, 4409, 'Opened somewhere else');
    }
    connection.participant = {
      id: connection.id,
      userId,
      blocked: new Set(await this.videochat.blockedUserIds(userId)),
    };
    this.byUser.set(userId, connection);
    this.send(connection, { type: 'ready' });
  }

  private join(connection: Connection): void {
    const me = connection.participant as Participant;
    const result = this.matchmaker.join(me);
    if (result.status === 'waiting') {
      this.send(connection, { type: 'waiting' });
      return;
    }
    const partner = this.connections.get(result.partner.id);
    if (!partner) {
      // Can't happen (closed sockets leave the queue), but never leave someone hanging.
      this.matchmaker.remove(connection.id);
      this.join(connection);
      return;
    }
    const call: CallLog = { lines: [] };
    connection.call = call;
    partner.call = call;
    // The newcomer makes the WebRTC offer.
    this.send(connection, { type: 'matched', initiator: true });
    this.send(partner, { type: 'matched', initiator: false });
  }

  /** Ends the connection's call, if any: the partner is told and both remember it. */
  private endCall(connection: Connection): void {
    const partnerParticipant = this.matchmaker.remove(connection.id);
    if (!partnerParticipant) return;
    const partner = this.connections.get(partnerParticipant.id);
    const now = Date.now();
    const me = connection.participant as Participant;
    const call = connection.call ?? { lines: [] };
    me.lastPartner = { userId: partnerParticipant.userId, until: now + REMATCH_COOLDOWN_MS };
    partnerParticipant.lastPartner = { userId: me.userId, until: now + REMATCH_COOLDOWN_MS };
    connection.last = { userId: partnerParticipant.userId, call, endedAt: now };
    connection.call = undefined;
    if (partner) {
      partner.last = { userId: me.userId, call, endedAt: now };
      partner.call = undefined;
      this.send(partner, { type: 'partner-left' });
    }
  }

  /** The person of the current call, or of the one that just ended. */
  private target(connection: Connection): { userId: string; call: CallLog } | undefined {
    const partner = this.matchmaker.partnerOf(connection.id);
    if (partner) return { userId: partner.userId, call: connection.call ?? { lines: [] } };
    if (connection.last && Date.now() - connection.last.endedAt < REPORT_WINDOW_MS) {
      return connection.last;
    }
    return undefined;
  }

  private async report(
    connection: Connection,
    reason: ReportReason,
    details: string | undefined,
  ): Promise<void> {
    const me = connection.participant as Participant;
    const target = this.target(connection);
    if (!target) return this.error(connection, 'no-partner');
    const transcript: TranscriptLine[] = target.call.lines.map((line) => ({
      from: line.userId === me.userId ? 'reporter' : 'reported',
      text: line.text,
      at: line.at,
    }));
    // Someone you report is also someone you don't want to see again.
    await this.applyBlock(connection, target.userId);
    await this.videochat.report({
      reporterId: me.userId,
      reportedId: target.userId,
      reason,
      details,
      transcript,
    });
    this.send(connection, { type: 'reported' });
  }

  private async block(connection: Connection): Promise<void> {
    const target = this.target(connection);
    if (!target) return this.error(connection, 'no-partner');
    await this.applyBlock(connection, target.userId);
    this.send(connection, { type: 'blocked' });
  }

  private async applyBlock(connection: Connection, blockedUserId: string): Promise<void> {
    const me = connection.participant as Participant;
    await this.videochat.block(me.userId, blockedUserId);
    me.blocked.add(blockedUserId);
    this.byUser.get(blockedUserId)?.participant?.blocked.add(me.userId);
    if (this.matchmaker.partnerOf(connection.id)?.userId === blockedUserId) {
      this.endCall(connection);
    }
  }

  private suspended(userId: string): void {
    const connection = this.byUser.get(userId);
    if (!connection) return;
    this.send(connection, { type: 'suspended' });
    this.close(connection, 4403, 'Suspended');
  }

  // --- Helpers -------------------------------------------------------------------------------

  private partnerConnection(connection: Connection): Connection | undefined {
    const partner = this.matchmaker.partnerOf(connection.id);
    return partner ? this.connections.get(partner.id) : undefined;
  }

  private send(connection: Connection, message: ServerMessage): void {
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  private error(connection: Connection, code: VideochatErrorCode): void {
    this.send(connection, { type: 'error', code });
  }

  private close(connection: Connection, code: number, reason: string): void {
    connection.socket.close(code, reason);
    // The partner hears at once, not when the close handshake ends.
    this.disconnected(connection);
  }
}

/** The visitor's IP: Nginx's X-Real-IP, else the last X-Forwarded-For hop, else the socket's. */
function clientIp(request: IncomingMessage): string {
  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp;
  const forwarded = request.headers['x-forwarded-for'];
  const hops = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.at(-1) ?? request.socket.remoteAddress ?? 'unknown';
}

function reject(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
