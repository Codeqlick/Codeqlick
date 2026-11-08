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
import { hasFilters, Matchmaker, WindowLimiter, type Participant } from './matchmaker.js';
import {
  clientMessageSchema,
  GROUP_MAX,
  type CallEndReason,
  type ClientMessage,
  type GroupContact,
  type GroupInviteEndReason,
  type GroupMember,
  type PublicProfile,
  type ReportReason,
  type ServerMessage,
  type VideochatErrorCode,
} from './videochat.schemas.js';
import { VideochatStatsService } from './videochat-stats.service.js';
import { VideochatPushService } from './videochat-push.service.js';
import { VideochatService, type TranscriptLine } from './videochat.service.js';

/** Where browsers open the signaling socket (Nginx maps wss://videochat.codeqlick.com/ws here). */
export const VIDEOCHAT_WS_PATH = WS_PATHS.videochat;
/** Largest message accepted (an SDP offer is a few KB). */
const MAX_MESSAGE_BYTES = 64 * 1024;
/** A socket must authenticate within this time. */
const AUTH_TIMEOUT_MS = 5_000;
/** Open sockets per IP (several tabs or people behind one router, but not a flood). */
const MAX_SOCKETS_PER_IP = 5;
/** After a call, the same two people aren't paired again for this long. */
const REMATCH_COOLDOWN_MS = 60_000;
/** People met in this time are matched only when nobody new is waiting… */
const RECENT_MS = 24 * 60 * 60 * 1000;
/** …remembering at most this many per account. */
const RECENT_MAX = 20;
/** A call that just ended can still be reported or blocked for this long. */
const REPORT_WINDOW_MS = 5 * 60_000;
/** Text messages of a call kept for a report. */
const TRANSCRIPT_LINES = 30;
/** Sent every 30 s; a socket that didn't answer the previous one is dropped. */
const HEARTBEAT_MS = 30_000;
/** Someone waiting alone this long makes the API notify people who asked to know. */
const PUSH_WAIT_MS = 20_000;
/** How often people left waiting are paired again (a cooldown ran out) and told who else waits. */
const REMATCH_EVERY_MS = 5_000;
/** A call to a contact rings this long before it counts as declined. */
const RING_MS = 30_000;
/** An invitation to a group waits this long for an answer. */
const GROUP_INVITE_MS = 60_000;
/** Text messages of a group kept for a report. */
const GROUP_TRANSCRIPT_LINES = 100;
/** How often the API checks whether it is peak time (Web Push alerts). */
const PEAK_EVERY_MS = 5 * 60_000;

const ANONYMOUS: PublicProfile = {
  nickname: null,
  gender: null,
  country: null,
  language: null,
  interests: [],
};

/** A contact being called: rings until they answer, `RING_MS` pass, or either side moves. */
interface Ring {
  id: string;
  from: Connection;
  to: Connection;
  timer: NodeJS.Timeout;
  /** The contact was searching when the call came: they search again if it doesn't start. */
  toWasWaiting: boolean;
}

/** A group call between mutual contacts (in memory, up to GROUP_MAX people). */
interface Group {
  id: string;
  /** By connection id. */
  members: Map<string, Connection>;
  /** Pending invitations, by the invited account's id. */
  invites: Map<string, GroupInvite>;
  /** The group's last text messages, for a report. */
  lines: Array<{ userId: string; text: string; at: string }>;
}

interface GroupInvite {
  from: Connection;
  to: Connection;
  timer: NodeJS.Timeout;
}

interface CallLog {
  lines: Array<{ userId: string; text: string; at: string }>;
  /** When the call started (ms), for the anonymous statistics. */
  startedAt?: number;
  /** How long the two waited before it, on average (ms). */
  waitedMs?: number | null;
}

interface Connection {
  id: string;
  socket: WebSocket;
  ip: string;
  alive: boolean;
  authTimer?: NodeJS.Timeout;
  /** Fires when this person has waited alone long enough to notify others (Web Push). */
  waitTimer?: NodeJS.Timeout;
  /** Since when this person has been looking for someone (ms), for the statistics. */
  searchingSince?: number;
  /** The last `waiting` this person was told (to send only changes). */
  waitingSent?: string;
  participant?: Participant;
  /** The call to or from a contact ringing now. */
  ring?: string;
  /** What partners see of this person. */
  profile?: PublicProfile;
  call?: CallLog;
  /** The call that ended last, for a report or block right after it. */
  last?: { userId: string; call: CallLog; endedAt: number };
  /** The group call this person is in. */
  group?: Group;
  /** Groups that invited this person and wait for an answer. */
  groupInvites: Set<string>;
  /** The last people-online count this person was told (to send only changes). */
  onlineSent?: number;
  limits: {
    all: WindowLimiter;
    next: WindowLimiter;
    chat: WindowLimiter;
    signal: WindowLimiter;
    reports: WindowLimiter;
    calls: WindowLimiter;
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
  /** Per account, who they met and when (in memory; architecture 4.7). */
  private readonly recentPartners = new Map<string, Map<string, number>>();
  private readonly socketsPerIp = new Map<string, number>();
  private readonly rings = new Map<string, Ring>();
  private readonly groups = new Map<string, Group>();
  private server?: Server;
  private heartbeat?: NodeJS.Timeout;
  private rematcher?: NodeJS.Timeout;
  private peakChecker?: NodeJS.Timeout;
  private suspensions?: Subscription;
  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) =>
    this.upgrade(request, socket, head);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly videochat: VideochatService,
    private readonly config: AppConfigService,
    private readonly push: VideochatPushService,
    private readonly statistics: VideochatStatsService,
  ) {}

  onApplicationBootstrap(): void {
    this.server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.server.on('upgrade', this.onUpgrade);
    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) =>
      this.connected(socket, request),
    );
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
    this.heartbeat.unref();
    this.rematcher = setInterval(() => this.rematch(), REMATCH_EVERY_MS);
    this.rematcher.unref();
    if (this.config.nodeEnv !== 'test') {
      this.peakChecker = setInterval(() => this.checkPeak(), PEAK_EVERY_MS);
      this.peakChecker.unref();
    }
    this.suspensions = this.videochat.suspensions.subscribe((userId) => this.suspended(userId));
  }

  onModuleDestroy(): void {
    this.server?.off('upgrade', this.onUpgrade);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.rematcher) clearInterval(this.rematcher);
    if (this.peakChecker) clearInterval(this.peakChecker);
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

  /** Whether an account is in the video chat now, and in a call (or ringing). */
  presence(userId: string): { online: boolean; busy: boolean } {
    const connection = this.byUser.get(userId);
    if (!connection) return { online: false, busy: false };
    return {
      online: true,
      busy: this.isBusy(connection),
    };
  }

  /** In a call, a group, or ringing. */
  private isBusy(connection: Connection): boolean {
    return !!connection.ring || !!connection.group || !!this.matchmaker.partnerOf(connection.id);
  }

  // --- Connection lifecycle ------------------------------------------------------------------

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!ownUpgrade(request, socket, VIDEOCHAT_WS_PATH)) return;
    const origin = request.headers.origin?.replace(/\/+$/, '');
    const originAllowed = origin
      ? this.config.videochatOrigins.includes(origin)
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
    const connection: Connection = {
      id: randomUUID(),
      socket,
      ip,
      alive: true,
      groupInvites: new Set(),
      limits: {
        all: new WindowLimiter(400, 60_000),
        next: new WindowLimiter(20, 60_000),
        chat: new WindowLimiter(20, 10_000),
        signal: new WindowLimiter(200, 60_000),
        reports: new WindowLimiter(5, 60_000),
        calls: new WindowLimiter(10, 60_000),
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
    if (connection.waitTimer) clearTimeout(connection.waitTimer);
    if (connection.ring) this.finishRing(connection.ring, 'offline', connection);
    this.endCall(connection);
    this.leaveGroup(connection);
    for (const groupId of connection.groupInvites) {
      const group = this.groups.get(groupId);
      const userId = connection.participant?.userId;
      if (group && userId) this.endInvite(group, userId, 'offline', connection);
    }
    if (connection.participant && this.byUser.get(connection.participant.userId) === connection) {
      this.byUser.delete(connection.participant.userId);
    }
    const count = (this.socketsPerIp.get(connection.ip) ?? 1) - 1;
    if (count <= 0) this.socketsPerIp.delete(connection.ip);
    else this.socketsPerIp.set(connection.ip, count);
  }

  private ping(): void {
    this.forgetOldPartners();
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
    // Searching, skipping or stopping also hangs up a contact's call that is ringing.
    if (
      connection.ring &&
      (message.type === 'join' || message.type === 'next' || message.type === 'leave')
    ) {
      this.finishRing(connection.ring, 'cancelled', connection);
    }
    // Searching or skipping leaves a group call.
    if (connection.group && (message.type === 'join' || message.type === 'next')) {
      this.leaveGroup(connection);
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
        connection.searchingSince = undefined;
        return;
      case 'widen':
        // Only while waiting and with filters to ignore; the next search uses them again.
        if (!this.matchmaker.isWaiting(connection.id) || !hasFilters(me.prefs) || me.widened)
          return;
        me.widened = true;
        this.rematch();
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
      case 'typing': {
        if (!connection.limits.signal.take()) return;
        const partner = this.partnerConnection(connection);
        if (partner) this.send(partner, { type: 'typing', on: message.on });
        return;
      }
      case 'react': {
        if (!connection.limits.chat.take()) return this.error(connection, 'rate-limited');
        const partner = this.partnerConnection(connection);
        if (!partner) return this.error(connection, 'no-partner');
        this.send(partner, { type: 'react', emoji: message.emoji });
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
      case 'like':
        if (!connection.limits.reports.take()) return this.error(connection, 'rate-limited');
        await this.like(connection);
        return;
      case 'call':
        if (!connection.limits.calls.take()) return this.error(connection, 'rate-limited');
        await this.call(connection, message.contactId);
        return;
      case 'answer':
        this.answer(connection, message.callId, message.accept);
        return;
      case 'group-invite':
        if (!connection.limits.calls.take()) return this.error(connection, 'rate-limited');
        await this.groupInvite(connection, message.contactId);
        return;
      case 'group-answer':
        this.groupAnswer(connection, message.groupId, message.accept);
        return;
      case 'group-leave':
        this.leaveGroup(connection);
        return;
      case 'group-signal': {
        if (!connection.limits.signal.take()) return this.error(connection, 'rate-limited');
        const target = connection.group?.members.get(message.to);
        if (!target || target === connection) return this.error(connection, 'not-in-group');
        this.send(target, { type: 'group-signal', from: connection.id, data: message.data });
        return;
      }
      case 'group-chat': {
        if (!connection.limits.chat.take()) return this.error(connection, 'rate-limited');
        const group = connection.group;
        if (!group) return this.error(connection, 'not-in-group');
        group.lines.push({ userId: me.userId, text: message.text, at: new Date().toISOString() });
        if (group.lines.length > GROUP_TRANSCRIPT_LINES) group.lines.shift();
        for (const member of group.members.values()) {
          if (member !== connection)
            this.send(member, { type: 'group-chat', from: connection.id, text: message.text });
        }
        return;
      }
      case 'group-report':
        if (!connection.limits.reports.take()) return this.error(connection, 'rate-limited');
        await this.groupReport(connection, message.memberId, message.reason, message.details);
        return;
      case 'group-block':
        if (!connection.limits.reports.take()) return this.error(connection, 'rate-limited');
        await this.groupBlock(connection, message.memberId);
        return;
      case 'group-contacts':
        if (!connection.limits.calls.take()) return this.error(connection, 'rate-limited');
        await this.groupContacts(connection);
        return;
    }
  }

  private async authenticate(connection: Connection, ticket: string): Promise<void> {
    if (connection.participant) return;
    const userId = this.videochat.redeemTicket(ticket);
    const access = userId ? await this.videochat.connection(userId) : undefined;
    if (!userId || !access?.allowed) {
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
      prefs: access.prefs,
      interests: access.publicProfile.interests,
      recent: this.recentOf(userId),
    };
    connection.profile = access.publicProfile;
    this.byUser.set(userId, connection);
    this.statistics.markActive(userId);
    this.send(connection, { type: 'ready' });
    this.sendOnline(connection);
  }

  private join(connection: Connection): void {
    const me = connection.participant as Participant;
    // A widened search lasts one wait.
    me.widened = false;
    connection.waitingSent = undefined;
    connection.searchingSince ??= Date.now();
    const result = this.matchmaker.join(me);
    if (connection.waitTimer) clearTimeout(connection.waitTimer);
    if (result.status === 'waiting') {
      this.sendWaiting(connection, this.matchmaker.waitingCount - 1);
      if (this.push.enabled) {
        connection.waitTimer = setTimeout(() => this.waitedAlone(connection), PUSH_WAIT_MS);
        connection.waitTimer.unref();
      }
      return;
    }
    const partner = this.connections.get(result.partner.id);
    if (!partner) {
      // Can't happen (closed sockets leave the queue), but never leave someone hanging.
      this.matchmaker.remove(connection.id);
      this.join(connection);
      return;
    }
    // The newcomer makes the WebRTC offer.
    this.startCall(connection, partner);
  }

  /** Puts two connections in a call; `initiator` makes the WebRTC offer. */
  private startCall(initiator: Connection, other: Connection): void {
    const now = Date.now();
    const waits = [initiator, other].flatMap((c) =>
      c.searchingSince === undefined ? [] : [now - c.searchingSince],
    );
    const call: CallLog = {
      lines: [],
      startedAt: now,
      waitedMs: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
    };
    for (const connection of [initiator, other]) {
      connection.searchingSince = undefined;
      connection.call = call;
      connection.waitingSent = undefined;
      if (connection.participant) connection.participant.widened = false;
      if (connection.waitTimer) clearTimeout(connection.waitTimer);
    }
    if (initiator.participant && other.participant) {
      this.remember(initiator.participant.userId, other.participant.userId);
      this.remember(other.participant.userId, initiator.participant.userId);
    }
    const anonymous = ANONYMOUS;
    this.send(initiator, {
      type: 'matched',
      initiator: true,
      partner: other.profile ?? anonymous,
    });
    this.send(other, {
      type: 'matched',
      initiator: false,
      partner: initiator.profile ?? anonymous,
    });
  }

  /** Tells someone waiting how things stand, when that changed. */
  private sendWaiting(connection: Connection, others: number): void {
    const me = connection.participant;
    const message = {
      type: 'waiting' as const,
      others,
      filtered: hasFilters(me?.prefs),
      widened: me?.widened === true,
    };
    const key = JSON.stringify(message);
    if (connection.waitingSent === key) return;
    connection.waitingSent = key;
    this.send(connection, message);
  }

  /** Notes that `userId` met `partnerId` (the newest 20 in 24 hours are kept). */
  private remember(userId: string, partnerId: string, now: number = Date.now()): void {
    const met = this.recentPartners.get(userId) ?? new Map<string, number>();
    met.delete(partnerId);
    met.set(partnerId, now);
    for (const [id, at] of met) {
      if (met.size <= RECENT_MAX && at > now - RECENT_MS) break;
      met.delete(id);
    }
    this.recentPartners.set(userId, met);
  }

  /** Whom an account met in the last 24 hours, as the matchmaker reads it. */
  private recentOf(userId: string): { has(partnerId: string): boolean } {
    return {
      has: (partnerId) => {
        const at = this.recentPartners.get(userId)?.get(partnerId);
        return at !== undefined && at > Date.now() - RECENT_MS;
      },
    };
  }

  /** Forgets accounts whose last meeting is over 24 hours old. */
  private forgetOldPartners(now: number = Date.now()): void {
    for (const [userId, met] of this.recentPartners) {
      const newest = [...met.values()].at(-1) ?? 0;
      if (newest <= now - RECENT_MS) this.recentPartners.delete(userId);
    }
  }

  /**
   * Pairs people left waiting who may meet now (two who just skipped each other, once the
   * cooldown runs out) and tells everyone still waiting how many others wait but don't fit.
   */
  private rematch(now: number = Date.now()): void {
    for (const [older, newer] of this.matchmaker.pairWaiting(now)) {
      const a = this.connections.get(older.id);
      const b = this.connections.get(newer.id);
      if (!a || !b) {
        // Can't happen (closed sockets leave the queue): put whoever is left back.
        this.matchmaker.remove(older.id);
        if (a) this.join(a);
        if (b) this.join(b);
        continue;
      }
      this.startCall(b, a);
    }
    const others = this.matchmaker.waitingCount - 1;
    for (const participant of this.matchmaker.waiting) {
      const connection = this.connections.get(participant.id);
      if (connection) this.sendWaiting(connection, others);
    }
    // People not in a call or a group see how many are online, when it changed.
    for (const connection of this.byUser.values()) {
      if (!connection.group && !this.matchmaker.partnerOf(connection.id))
        this.sendOnline(connection);
    }
  }

  private sendOnline(connection: Connection): void {
    const count = this.byUser.size;
    if (connection.onlineSent === count) return;
    connection.onlineSent = count;
    this.send(connection, { type: 'online', count });
  }

  /** Peak time alerts (Web Push), when it is peak time now. */
  private checkPeak(): void {
    if (!this.push.enabled) return;
    void this.push.peakTime(this.byUser.size, [...this.byUser.keys()]).catch((error: unknown) => {
      this.logger.error(`Videochat peak time alerts failed: ${String(error)}`);
    });
  }

  /** Still waiting, and nobody else is: tell people who asked to know (Web Push). */
  private waitedAlone(connection: Connection): void {
    const me = connection.participant;
    if (!me || !this.matchmaker.isWaiting(connection.id) || this.matchmaker.waitingCount > 1)
      return;
    void this.push
      .someoneWaiting(
        { userId: me.userId, blocked: me.blocked, prefs: me.prefs },
        this.byUser.keys(),
      )
      .catch((error: unknown) => {
        this.logger.error(`Videochat notifications failed: ${String(error)}`);
      });
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
    if (call.startedAt !== undefined) {
      this.statistics.logCall(call.startedAt, now, call.waitedMs ?? null);
      this.statistics.countCall(call.startedAt, now, me.userId, partnerParticipant.userId);
    }
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

  // --- Mutual contacts ---------------------------------------------------------------------

  /** "I like them"; when it is mutual, both are told they are contacts now. */
  private async like(connection: Connection): Promise<void> {
    const me = connection.participant as Participant;
    const target = this.target(connection);
    if (!target || me.blocked.has(target.userId)) return this.error(connection, 'no-partner');
    const mutual = await this.videochat.like(me.userId, target.userId);
    this.send(connection, { type: 'liked' });
    if (!mutual) return;
    const other = this.byUser.get(target.userId);
    this.send(connection, { type: 'mutual', nickname: other?.profile?.nickname ?? null });
    if (other) this.send(other, { type: 'mutual', nickname: connection.profile?.nickname ?? null });
  }

  /** Rings a mutual contact who is here and free. */
  private async call(connection: Connection, contactId: string): Promise<void> {
    const me = connection.participant as Participant;
    if (me.blocked.has(contactId) || !(await this.videochat.areContacts(me.userId, contactId))) {
      return this.error(connection, 'not-contact');
    }
    if (!this.connections.has(connection.id)) return;
    const other = this.byUser.get(contactId);
    const callId = randomUUID();
    if (!other?.participant) {
      return this.send(connection, { type: 'call-ended', callId, reason: 'offline' });
    }
    if (this.isBusy(other)) {
      return this.send(connection, { type: 'call-ended', callId, reason: 'busy' });
    }
    if (connection.ring) this.finishRing(connection.ring, 'cancelled', connection);
    this.leaveGroup(connection);
    // The caller leaves whatever they were in; the contact stops searching while it rings.
    this.endCall(connection);
    this.matchmaker.remove(connection.id);
    connection.searchingSince = undefined;
    if (connection.waitTimer) clearTimeout(connection.waitTimer);
    const toWasWaiting = this.matchmaker.isWaiting(other.id);
    this.matchmaker.remove(other.id);
    if (other.waitTimer) clearTimeout(other.waitTimer);
    const timer = setTimeout(() => this.finishRing(callId, 'timeout'), RING_MS);
    timer.unref();
    this.rings.set(callId, { id: callId, from: connection, to: other, timer, toWasWaiting });
    connection.ring = callId;
    other.ring = callId;
    this.send(connection, { type: 'calling', callId, partner: other.profile ?? ANONYMOUS });
    this.send(other, { type: 'incoming', callId, partner: connection.profile ?? ANONYMOUS });
  }

  /** The contact accepts (the call starts; the caller makes the offer) or declines. */
  private answer(connection: Connection, callId: string, accept: boolean): void {
    const ring = this.rings.get(callId);
    if (!ring || ring.to !== connection) return;
    if (!accept) {
      this.finishRing(callId, 'declined', connection);
      // Declining while searching goes on searching.
      if (ring.toWasWaiting) this.join(connection);
      return;
    }
    this.clearRing(ring);
    this.leaveGroup(connection);
    this.leaveGroup(ring.from);
    const caller = ring.from.participant as Participant;
    const callee = connection.participant as Participant;
    connection.searchingSince = undefined;
    this.matchmaker.pair(caller, callee);
    this.startCall(ring.from, connection);
  }

  /**
   * Ends a ringing call that won't start: both sides hear why. The contact searches again if
   * they were searching, unless they are the one who moved on.
   */
  private finishRing(callId: string, reason: CallEndReason, by?: Connection): void {
    const ring = this.rings.get(callId);
    if (!ring) return;
    this.clearRing(ring);
    for (const side of [ring.from, ring.to]) {
      if (side !== by || reason === 'declined')
        this.send(side, { type: 'call-ended', callId, reason });
    }
    if (
      ring.toWasWaiting &&
      by !== ring.to &&
      this.connections.has(ring.to.id) &&
      !this.matchmaker.partnerOf(ring.to.id)
    ) {
      this.join(ring.to);
    }
  }

  private clearRing(ring: Ring): void {
    clearTimeout(ring.timer);
    this.rings.delete(ring.id);
    ring.from.ring = undefined;
    ring.to.ring = undefined;
  }

  // --- Group calls ---------------------------------------------------------------------------

  private memberOf(connection: Connection): GroupMember {
    return { memberId: connection.id, profile: connection.profile ?? ANONYMOUS };
  }

  /** Leaves 1:1 calls, rings and the queue (to start or join a group). */
  private leaveOneToOne(connection: Connection): void {
    if (connection.ring) this.finishRing(connection.ring, 'cancelled', connection);
    this.endCall(connection);
    this.matchmaker.remove(connection.id);
    connection.searchingSince = undefined;
    if (connection.waitTimer) clearTimeout(connection.waitTimer);
  }

  /** Whether `connection` and anyone in the group blocked each other (either way). */
  private blockedWith(group: Group, connection: Connection): boolean {
    const me = connection.participant;
    if (!me) return true;
    for (const member of group.members.values()) {
      const other = member.participant;
      if (!other) continue;
      if (me.blocked.has(other.userId) || other.blocked.has(me.userId)) return true;
    }
    return false;
  }

  /** Invites a mutual contact to my group; the first invitation starts the group. */
  private async groupInvite(connection: Connection, contactId: string): Promise<void> {
    const me = connection.participant as Participant;
    const known =
      !me.blocked.has(contactId) && (await this.videochat.areContacts(me.userId, contactId));
    if (!this.connections.has(connection.id)) return;
    const other = this.byUser.get(contactId);
    const nickname = other?.profile?.nickname ?? null;
    if (!known) {
      this.send(connection, {
        type: 'group-invite-ended',
        groupId: connection.group?.id ?? randomUUID(),
        nickname,
        reason: 'not-contact',
      });
      return;
    }
    let group = connection.group;
    if (!group) {
      this.leaveOneToOne(connection);
      group = {
        id: randomUUID(),
        members: new Map([[connection.id, connection]]),
        invites: new Map(),
        lines: [],
      };
      this.groups.set(group.id, group);
      connection.group = group;
      this.send(connection, { type: 'group', groupId: group.id, self: connection.id, members: [] });
    }
    const fail = (reason: GroupInviteEndReason) =>
      this.send(connection, {
        type: 'group-invite-ended',
        groupId: (group as Group).id,
        nickname,
        reason,
      });
    if (group.invites.has(contactId) || other?.group === group) return;
    if (!other?.participant) return fail('offline');
    if (group.members.size + group.invites.size >= GROUP_MAX) return fail('full');
    if (this.blockedWith(group, other)) return fail('blocked');
    if (this.isBusy(other)) return fail('busy');
    const groupId = group.id;
    const timer = setTimeout(() => {
      const current = this.groups.get(groupId);
      if (current) this.endInvite(current, contactId, 'timeout');
    }, GROUP_INVITE_MS);
    timer.unref();
    group.invites.set(contactId, { from: connection, to: other, timer });
    other.groupInvites.add(groupId);
    this.send(other, {
      type: 'group-invited',
      groupId,
      from: connection.profile ?? ANONYMOUS,
      size: group.members.size,
    });
  }

  /** Ends an invitation that won't be used: both sides hear why (but whoever ended it). */
  private endInvite(
    group: Group,
    userId: string,
    reason: GroupInviteEndReason,
    by?: Connection,
  ): void {
    const invite = group.invites.get(userId);
    if (!invite) return;
    clearTimeout(invite.timer);
    group.invites.delete(userId);
    invite.to.groupInvites.delete(group.id);
    if (invite.from !== by && this.connections.has(invite.from.id)) {
      this.send(invite.from, {
        type: 'group-invite-ended',
        groupId: group.id,
        nickname: invite.to.profile?.nickname ?? null,
        reason,
      });
    }
    if (invite.to !== by) {
      this.send(invite.to, {
        type: 'group-invite-ended',
        groupId: group.id,
        nickname: invite.from.profile?.nickname ?? null,
        reason,
      });
    }
  }

  /** The invited person joins the group (and makes an offer to each member) or declines. */
  private groupAnswer(connection: Connection, groupId: string, accept: boolean): void {
    const me = connection.participant as Participant;
    const group = this.groups.get(groupId);
    const invite = group?.invites.get(me.userId);
    if (!group || !invite || invite.to !== connection) {
      if (accept) {
        this.send(connection, {
          type: 'group-invite-ended',
          groupId,
          nickname: null,
          reason: 'gone',
        });
      }
      return;
    }
    if (!accept) return this.endInvite(group, me.userId, 'declined', connection);
    if (this.blockedWith(group, connection)) return this.endInvite(group, me.userId, 'blocked');
    if (group.members.size >= GROUP_MAX) return this.endInvite(group, me.userId, 'full');
    clearTimeout(invite.timer);
    group.invites.delete(me.userId);
    connection.groupInvites.delete(groupId);
    this.leaveGroup(connection);
    this.leaveOneToOne(connection);
    const members = [...group.members.values()].map((member) => this.memberOf(member));
    for (const member of group.members.values()) {
      this.send(member, { type: 'group-joined', member: this.memberOf(connection) });
    }
    group.members.set(connection.id, connection);
    connection.group = group;
    this.send(connection, { type: 'group', groupId, self: connection.id, members });
  }

  /** Leaves the group; the others are told. An empty group ends with its invitations. */
  private leaveGroup(connection: Connection): void {
    const group = connection.group;
    if (!group) return;
    group.members.delete(connection.id);
    connection.group = undefined;
    connection.onlineSent = undefined;
    for (const member of group.members.values()) {
      this.send(member, { type: 'group-left', memberId: connection.id });
    }
    if (group.members.size === 0) {
      for (const userId of group.invites.keys()) this.endInvite(group, userId, 'gone');
      this.groups.delete(group.id);
    }
  }

  /** A member of my group, by their member id (never myself). */
  private groupTarget(connection: Connection, memberId: string): string | undefined {
    const target = connection.group?.members.get(memberId);
    if (!target || target === connection) return undefined;
    return target.participant?.userId;
  }

  /** Reports a member: the reporter leaves the group and blocks them; the report keeps both
   * people's last group messages. */
  private async groupReport(
    connection: Connection,
    memberId: string,
    reason: ReportReason,
    details: string | undefined,
  ): Promise<void> {
    const me = connection.participant as Participant;
    const group = connection.group;
    const targetId = this.groupTarget(connection, memberId);
    if (!group || !targetId) return this.error(connection, 'not-in-group');
    const transcript: TranscriptLine[] = group.lines
      .filter((line) => line.userId === me.userId || line.userId === targetId)
      .slice(-TRANSCRIPT_LINES)
      .map((line) => ({
        from: line.userId === me.userId ? 'reporter' : 'reported',
        text: line.text,
        at: line.at,
      }));
    this.leaveGroup(connection);
    await this.applyBlock(connection, targetId);
    await this.videochat.report({
      reporterId: me.userId,
      reportedId: targetId,
      reason,
      details,
      transcript,
    });
    this.send(connection, { type: 'reported' });
  }

  private async groupBlock(connection: Connection, memberId: string): Promise<void> {
    const targetId = this.groupTarget(connection, memberId);
    if (!targetId) return this.error(connection, 'not-in-group');
    this.leaveGroup(connection);
    await this.applyBlock(connection, targetId);
    this.send(connection, { type: 'blocked' });
  }

  /** My contacts and whether each one can be invited to my group now. */
  private async groupContacts(connection: Connection): Promise<void> {
    const me = connection.participant as Participant;
    const { items } = await this.videochat.contacts(me.userId, () => ({
      online: false,
      busy: false,
    }));
    const group = connection.group;
    const status = (contactId: string): GroupContact['status'] => {
      const other = this.byUser.get(contactId);
      if (!other?.participant) return 'offline';
      if (group && other.group === group) return 'in-group';
      if (group?.invites.has(contactId)) return 'invited';
      return this.isBusy(other) ? 'busy' : 'free';
    };
    this.send(connection, {
      type: 'group-contacts',
      items: items
        .filter((item) => !me.blocked.has(item.contactId))
        .map((item) => ({
          contactId: item.contactId,
          nickname: item.nickname,
          status: status(item.contactId),
        })),
    });
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
