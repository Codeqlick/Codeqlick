import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { MeetingRoom } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { iceServersFor, type IceServer } from '../../common/websocket/turn.js';
import { MeetingsRepository } from './meetings.repository.js';
import {
  CODE_ALPHABET,
  MEETING_MAX_ROOMS,
  type CreateRoomInput,
  type UpdateRoomInput,
} from './meetings.schemas.js';

/** A ticket opens one WebSocket, once, within this time. */
export const TICKET_TTL_MS = 30_000;

export interface MeetingTicket {
  ticket: string;
  expiresIn: number;
  iceServers: IceServer[];
  /** The room's code and title, for the page. */
  room: { code: string; title: string };
}

/** Who a ticket lets in, and where. */
export interface TicketHolder {
  roomId: string;
  /** Null for a guest. */
  userId: string | null;
  name: string;
}

export interface RoomView {
  id: string;
  code: string;
  title: string;
  lobby: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  /** People in the meeting right now. */
  live: number;
}

/** What anyone with the link may know of a room. */
export interface PublicRoom {
  code: string;
  title: string;
  ownerName: string;
  live: number;
}

/** A change the live meeting must follow. */
export type RoomEvent =
  | { kind: 'deleted'; roomId: string }
  | { kind: 'updated'; roomId: string; title: string; lobby: boolean };

function hash(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

/** `abc-defg-hij` from the code alphabet. */
export function randomCode(): string {
  let letters = '';
  for (let index = 0; index < 10; index += 1) {
    letters += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}`;
}

/** Meetings by link at meetings.codeqlick.com (architecture 4.8): rooms and tickets. */
@Injectable()
export class MeetingsService {
  /** Rooms deleted or changed, for the gateway. */
  readonly events = new Subject<RoomEvent>();
  /** SHA-256 of each unused ticket → who it lets in and until when. */
  private readonly tickets = new Map<string, TicketHolder & { expiresAt: number }>();

  constructor(
    private readonly repository: MeetingsRepository,
    private readonly config: AppConfigService,
  ) {}

  async listRooms(ownerId: string, live: (roomId: string) => number): Promise<RoomView[]> {
    const rooms = await this.repository.listByOwner(ownerId);
    return rooms.map((room) => this.view(room, live(room.id)));
  }

  async createRoom(ownerId: string, input: CreateRoomInput): Promise<RoomView> {
    if ((await this.repository.countByOwner(ownerId)) >= MEETING_MAX_ROOMS) {
      throw new ConflictException(`At most ${MEETING_MAX_ROOMS} rooms per account`);
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomCode();
      if (await this.repository.codeTaken(code)) continue;
      return this.view(await this.repository.create(ownerId, code, input.title), 0);
    }
    throw new ConflictException('Try again');
  }

  async updateRoom(
    ownerId: string,
    id: string,
    input: UpdateRoomInput,
    live: (roomId: string) => number,
  ): Promise<RoomView> {
    await this.ownRoom(ownerId, id);
    const room = await this.repository.update(id, input);
    this.events.next({ kind: 'updated', roomId: id, title: room.title, lobby: room.lobby });
    return this.view(room, live(id));
  }

  async deleteRoom(ownerId: string, id: string): Promise<void> {
    await this.ownRoom(ownerId, id);
    await this.repository.delete(id);
    this.events.next({ kind: 'deleted', roomId: id });
  }

  async publicRoom(code: string, live: (roomId: string) => number): Promise<PublicRoom> {
    const room = await this.repository.findByCode(code);
    if (!room) throw new NotFoundException('Room not found');
    return { code: room.code, title: room.title, ownerName: room.owner.name, live: live(room.id) };
  }

  /** A single-use ticket (30 s) into a room: a signed-in person's, or a guest's with a name. */
  async issueTicket(
    code: string,
    who: { userId: string | null; name: string },
    now: number = Date.now(),
  ): Promise<MeetingTicket> {
    const room = await this.repository.findByCode(code);
    if (!room) throw new NotFoundException('Room not found');
    this.pruneTickets(now);
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(hash(ticket), {
      roomId: room.id,
      userId: who.userId,
      name: who.name,
      expiresAt: now + TICKET_TTL_MS,
    });
    return {
      ticket,
      expiresIn: TICKET_TTL_MS / 1000,
      iceServers: iceServersFor(this.config.turn, who.userId ?? `guest-${randomUUID()}`, now),
      room: { code: room.code, title: room.title },
    };
  }

  /** Who the ticket lets in, once: a used, unknown or expired ticket gives undefined. */
  redeemTicket(ticket: string, now: number = Date.now()): TicketHolder | undefined {
    const key = hash(ticket);
    const entry = this.tickets.get(key);
    if (!entry) return undefined;
    this.tickets.delete(key);
    if (entry.expiresAt <= now) return undefined;
    return { roomId: entry.roomId, userId: entry.userId, name: entry.name };
  }

  /** The room as it is now (the gateway opens a live meeting with it). */
  findRoom(id: string): Promise<MeetingRoom | null> {
    return this.repository.findById(id);
  }

  async setLobby(id: string, on: boolean): Promise<void> {
    await this.repository.update(id, { lobby: on });
  }

  touch(id: string, now: Date = new Date()): Promise<void> {
    return this.repository.touch(id, now);
  }

  private async ownRoom(ownerId: string, id: string): Promise<MeetingRoom> {
    const room = await this.repository.findById(id);
    if (!room || room.ownerId !== ownerId) throw new NotFoundException('Room not found');
    return room;
  }

  private view(room: MeetingRoom, live: number): RoomView {
    return {
      id: room.id,
      code: room.code,
      title: room.title,
      lobby: room.lobby,
      createdAt: room.createdAt,
      lastUsedAt: room.lastUsedAt,
      live,
    };
  }

  private pruneTickets(now: number): void {
    for (const [key, entry] of this.tickets) {
      if (entry.expiresAt <= now) this.tickets.delete(key);
    }
  }
}
