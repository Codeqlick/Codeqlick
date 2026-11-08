import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * WebSocket paths on the API's HTTP server. Every gateway sees every upgrade request: each one
 * takes its own path and leaves the others alone; a path nobody serves is dropped.
 */
export const WS_PATHS = {
  videochat: '/v1/videochat/ws',
  meetings: '/v1/meetings/ws',
} as const;

const KNOWN = new Set<string>(Object.values(WS_PATHS));

/** The request's path when it is `own`; otherwise null (and the socket dropped when unknown). */
export function ownUpgrade(request: IncomingMessage, socket: Duplex, own: string): boolean {
  const path = (request.url ?? '').split('?')[0] ?? '';
  if (path === own) return true;
  if (!KNOWN.has(path)) socket.destroy();
  return false;
}

/** The visitor's IP: Nginx's X-Real-IP, else the last X-Forwarded-For hop, else the socket's. */
export function clientIp(request: IncomingMessage): string {
  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp;
  const forwarded = request.headers['x-forwarded-for'];
  const hops = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.at(-1) ?? request.socket.remoteAddress ?? 'unknown';
}

/** Answers an upgrade request with a plain HTTP error and closes it. */
export function rejectUpgrade(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
