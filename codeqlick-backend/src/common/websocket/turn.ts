import { createHmac } from 'node:crypto';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/** TURN credentials last this long (a long call keeps working). */
const TURN_TTL_SECONDS = 12 * 60 * 60;

/**
 * STUN as configured; TURN with time-limited credentials (coturn's `use-auth-secret`): the
 * username is `<expiry>:<who>` and the password its HMAC-SHA1 with the shared secret. Shared by
 * the web apps that make calls (video chat, meetings).
 */
export function iceServersFor(
  turnConfig: { urls: string[]; secret: string | undefined },
  who: string,
  now: number = Date.now(),
): IceServer[] {
  const { urls, secret } = turnConfig;
  const stun = urls.filter((url) => url.startsWith('stun:'));
  const turn = urls.filter((url) => url.startsWith('turn:') || url.startsWith('turns:'));
  const servers: IceServer[] = [];
  if (stun.length > 0) servers.push({ urls: stun });
  if (turn.length > 0 && secret) {
    const username = `${Math.floor(now / 1000) + TURN_TTL_SECONDS}:${who}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    servers.push({ urls: turn, username, credential });
  }
  return servers;
}
