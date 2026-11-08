import { z } from 'zod';

/** People in a meeting at once (browser-to-browser mesh: each one sends to all the others). */
export const MEETING_MAX_PEOPLE = 6;
/** People knocking at once on a room's waiting room. */
export const MEETING_MAX_WAITING = 20;
/** Rooms an account can have. */
export const MEETING_MAX_ROOMS = 20;
export const MEETING_CHAT_MAX_LENGTH = 500;

/** Letters of a room code: lowercase, without the ones easily mistaken (i, l, o). */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz';

/** `ABC-defg hij` → `abc-defg-hij`; null when it can't be a room code. */
export function normalizeCode(input: string): string | null {
  const letters = input.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length !== 10) return null;
  return `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}`;
}

export const roomTitleSchema = z.string().trim().min(1).max(80);

export const createRoomSchema = z.object({ title: roomTitleSchema }).strict();
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z
  .object({ title: roomTitleSchema.optional(), lobby: z.boolean().optional() })
  .strict();
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const codeParamSchema = z.object({
  code: z
    .string()
    .max(40)
    .transform((value, context) => {
      const code = normalizeCode(value);
      if (!code) {
        context.addIssue({ code: 'custom', message: 'Not a room code' });
        return z.NEVER;
      }
      return code;
    }),
});
export type CodeParam = z.infer<typeof codeParamSchema>;

export const guestNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  // No control characters.
  .regex(/^[^\p{Cc}]+$/u);

export const guestTicketSchema = z.object({ name: guestNameSchema }).strict();
export type GuestTicketInput = z.infer<typeof guestTicketSchema>;

// --- WebSocket messages (browser → server) ----------------------------------------------------

const sdpSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1).max(20_000),
});

const candidateSchema = z.object({
  candidate: z.string().max(2_000),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
});

/** WebRTC negotiation, relayed as is to one person of the meeting. */
export const signalDataSchema = z.union([
  z.object({ sdp: sdpSchema }).strict(),
  z.object({ candidate: candidateSchema }).strict(),
]);
export type SignalData = z.infer<typeof signalDataSchema>;

const mediaSchema = {
  audio: z.boolean(),
  video: z.boolean(),
  screen: z.boolean(),
};
export type MediaState = { audio: boolean; video: boolean; screen: boolean };

/** Ids of people in a meeting are random UUIDs, one per connection. */
const peerId = z.uuid();

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('auth'),
    ticket: z.string().min(16).max(128),
    audio: z.boolean().optional(),
    video: z.boolean().optional(),
  }),
  z.object({ type: z.literal('signal'), to: peerId, data: signalDataSchema }),
  z.object({
    type: z.literal('chat'),
    text: z.string().trim().min(1).max(MEETING_CHAT_MAX_LENGTH),
  }),
  z.object({ type: z.literal('media'), ...mediaSchema }),
  // The owner's.
  z.object({ type: z.literal('admit'), id: peerId, accept: z.boolean() }),
  z.object({ type: z.literal('remove'), id: peerId }),
  z.object({ type: z.literal('lobby'), on: z.boolean() }),
  z.object({ type: z.literal('end') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export interface PeerInfo extends MediaState {
  id: string;
  name: string;
  owner: boolean;
  guest: boolean;
}

export type MeetingErrorCode =
  | 'bad-message'
  | 'not-authenticated'
  | 'invalid-ticket'
  | 'not-owner'
  | 'not-found'
  | 'rate-limited';

/** Server → browser. */
export type ServerMessage =
  /** In the waiting room until the owner lets them in. */
  | { type: 'waiting'; title: string }
  | {
      type: 'ready';
      self: PeerInfo;
      room: { code: string; title: string; lobby: boolean };
      peers: PeerInfo[];
      /** People knocking (owners only). */
      knocks: Array<{ id: string; name: string }>;
    }
  | { type: 'knock'; id: string; name: string }
  | { type: 'knock-gone'; id: string }
  | { type: 'joined'; peer: PeerInfo }
  | { type: 'left'; id: string }
  | ({ type: 'media'; id: string } & MediaState)
  | { type: 'signal'; from: string; data: SignalData }
  | { type: 'chat'; from: string; name: string; text: string; at: string }
  | { type: 'lobby'; on: boolean }
  | { type: 'declined' }
  | { type: 'removed' }
  | { type: 'ended' }
  | { type: 'full' }
  | { type: 'error'; code: MeetingErrorCode };
