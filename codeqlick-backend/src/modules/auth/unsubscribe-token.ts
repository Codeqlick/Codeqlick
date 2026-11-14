import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';

/**
 * Signed, stateless tokens of the optional emails' unsubscribe links (architecture 4.3,
 * decision 70): `<payload>.<signature>`, where the payload is the base64url of `<userId>:<kind>`
 * and the signature the base64url HMAC-SHA256 of the payload, keyed with the HMAC-SHA256 of the
 * label `email-unsubscribe` under JWT_ACCESS_SECRET. No table and no expiry: rotating that secret
 * is the only thing that invalidates a link.
 */
export const UNSUBSCRIBE_KINDS = ['digest', 'report'] as const;
export type UnsubscribeKind = (typeof UNSUBSCRIBE_KINDS)[number];

export interface UnsubscribeClaim {
  userId: string;
  kind: UnsubscribeKind;
}

const KEY_LABEL = 'email-unsubscribe';
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function deriveKey(masterSecret: string): Buffer {
  return createHmac('sha256', masterSecret).update(KEY_LABEL).digest();
}

function sign(payload: string, masterSecret: string): Buffer {
  return createHmac('sha256', deriveKey(masterSecret)).update(payload).digest();
}

function isKind(value: string): value is UnsubscribeKind {
  return (UNSUBSCRIBE_KINDS as readonly string[]).includes(value);
}

/** The token of one person's link for one kind of optional email. */
export function makeUnsubscribeToken(claim: UnsubscribeClaim, masterSecret: string): string {
  const payload = Buffer.from(`${claim.userId}:${claim.kind}`, 'utf8').toString('base64url');
  return `${payload}.${sign(payload, masterSecret).toString('base64url')}`;
}

/** The claim of a genuine token, or null for anything else (malformed, forged, unknown kind). */
export function verifyUnsubscribeToken(
  token: string,
  masterSecret: string,
): UnsubscribeClaim | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  if (!BASE64URL.test(payload) || !BASE64URL.test(signature)) return null;
  const expected = sign(payload, masterSecret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const separator = decoded.lastIndexOf(':');
  if (separator <= 0) return null;
  const userId = decoded.slice(0, separator);
  const kind = decoded.slice(separator + 1);
  return isKind(kind) ? { userId, kind } : null;
}

/** The two URLs an optional email carries. */
export interface UnsubscribeLinks {
  /** `PUBLIC_API_URL/email/unsubscribe?token=…`, for the `List-Unsubscribe` header (RFC 8058). */
  oneClick: string;
  /** `SITE_URL/{locale}/email/unsubscribe?token=…`, the visible link in the footer. */
  page: string;
}

export interface UnsubscribeLinkConfig {
  /** JWT_ACCESS_SECRET, the master secret the signing key is derived from. */
  secret: string;
  /** PUBLIC_API_URL, which already ends in `/v1`. */
  publicApiUrl: string;
  /** SITE_URL. */
  siteUrl: string;
}

/** The links of one person's optional email of one kind, the page in their language. */
export function unsubscribeLinks(
  claim: UnsubscribeClaim,
  locale: ApiLocale,
  config: UnsubscribeLinkConfig,
): UnsubscribeLinks {
  const token = encodeURIComponent(makeUnsubscribeToken(claim, config.secret));
  const api = config.publicApiUrl.replace(/\/+$/, '');
  const site = config.siteUrl.replace(/\/+$/, '');
  return {
    oneClick: `${api}/email/unsubscribe?token=${token}`,
    page: `${site}/${locale}/email/unsubscribe?token=${token}`,
  };
}

/** `l***@example.com`: enough for the person to recognise their address, not to read it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
